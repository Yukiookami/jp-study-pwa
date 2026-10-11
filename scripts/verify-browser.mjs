import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
process.loadEnvFile('.env');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/jp_study_test';
process.env.DATABASE_URL = url.toString();
process.env.API_PORT = '3002';
process.env.API_HOST = '127.0.0.1';
if (new URL(process.env.DATABASE_URL).pathname !== '/jp_study_test')
  throw new Error('只能使用测试库');
const { db } = await import('../apps/api/dist/db.js');
await db.$executeRawUnsafe('TRUNCATE TABLE "User", "Lesson", "Vocabulary" CASCADE');
await db.$disconnect();
const fixtureRoot = await mkdtemp(join(tmpdir(), 'jp-browser-lessons-'));
await cp('lessons', fixtureRoot, { recursive: true });
process.env.LESSONS_ROOT = fixtureRoot;
const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
  env: process.env,
  stdio: 'ignore',
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3002/api/v1/health');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, '测试服务未启动');
  browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP shiro-mac-home 127.0.0.1', '--no-proxy-server'],
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (e) => {
    failures.push(e.message);
    console.error('页面错误：' + e.message);
  });
  const base = 'http://127.0.0.1:3002';
  const output = resolve('work/verification');
  await mkdir(output, { recursive: true });
  await page.goto(base + '/today');
  await page.getByRole('heading', { name: /把今天的日语/ }).waitFor();
  await page.screenshot({ path: resolve(output, 'today.png'), fullPage: true });
  await page.getByRole('link', { name: '查表达' }).click();
  await page.getByRole('textbox', { name: '搜索学习内容' }).fill('伝えば');
  await page
    .getByRole('button', { name: '動詞のば形 如果传达' })
    .count()
    .catch(() => {});
  const heading = page.locator('.item-heading').filter({ hasText: '動詞のば形' });
  await heading.waitFor();
  await heading.click();
  await page.locator('.correction').getByText('伝えれば', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'expression.png'), fullPage: true });
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
  await page.getByRole('button', { name: '全部内容', exact: true }).click();
  await page.locator('.item-heading').filter({ hasText: '動詞のば形' }).waitFor();
  await page.getByRole('button', { name: '取消收藏', exact: true }).click();
  await page.getByText('没有找到相关内容。试试中文意思或日语原说法。').waitFor();
  await page.getByRole('button', { name: '只看收藏', exact: true }).click();

  await page.getByRole('link', { name: '课堂', exact: true }).click();
  await page.locator('.course-card').first().click();
  await page.getByRole('button', { name: '下载这一课' }).click();
  await page.getByRole('status').getByText('这一课已下载，可以离线查看。').waitFor();
  await page.screenshot({ path: resolve(output, 'lesson.png'), fullPage: true });
  const sourceFolder = (await readdir(fixtureRoot)).find((n) => !n.startsWith('.'));
  const sourcePath = join(fixtureRoot, sourceFolder, 'lesson.json');
  const content = JSON.parse(await readFile(sourcePath, 'utf8'));
  await writeFile(sourcePath, '{"schema_version":');
  await page
    .getByText('1 份学习内容未导入，已有内容保留；请检查源文件。', { exact: true })
    .waitFor();
  const unchanged = await (await fetch(base + '/api/v1/lessons')).json();
  assert.equal(unchanged.data[0].title, content.lesson.title);
  content.lesson.title += ' · 自动更新验收';
  await writeFile(sourcePath, JSON.stringify(content));
  await page.getByRole('heading', { name: content.lesson.title, exact: true }).waitFor();
  const downloadedTitle = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('jp-study');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const get = request.result.transaction('lessons').objectStore('lessons').getAll();
          get.onsuccess = () => resolve(get.result[0]?.lesson.title);
          get.onerror = () => reject(get.error);
        };
      }),
  );
  assert.equal(downloadedTitle, content.lesson.title, '保存后应自动刷新已下载的副本');
  await page
    .getByText('1 份学习内容未导入，已有内容保留；请检查源文件。', { exact: true })
    .waitFor({ state: 'hidden' });
  console.log(
    '文件监听与推送检查通过：半份 JSON 保留旧课、保存完成自动导入、无需刷新页面且下载副本自动更新。',
  );

  assert(page.url().includes('/lesson/'), '课程路由不应带 Hash');
  const refreshed = await page.reload();
  assert.equal(refreshed.status(), 200);
  await page.locator('.item-heading').first().waitFor();
  const missing = await fetch(base + '/api/v1/not-a-real-endpoint');
  assert.equal(missing.status, 404);
  assert((missing.headers.get('content-type') ?? '').includes('application/json'));

  await page.getByRole('link', { name: '今日', exact: true }).click();
  await page.getByRole('link', { name: '开始复习' }).click();
  await page.getByRole('button', { name: '领取今日卡片' }).click();
  await page.getByRole('button', { name: '查看答案' }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.getByRole('button', { name: '查看答案', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'review.png'), fullPage: true });
  await page.getByRole('button', { name: '忘了 10 分钟后' }).click();
  await page.getByText('1 条答题已保存，等待同步').waitFor();
  const nextPrompt = await page.locator('.review-card h2').textContent();
  await page.reload();
  await page.getByRole('button', { name: '查看答案' }).waitFor();
  assert.equal(
    await page.locator('.review-card h2').textContent(),
    nextPrompt,
    '刷新应保留剩余卡片',
  );
  await page.getByRole('link', { name: '今日', exact: true }).click();
  await page.getByRole('link', { name: '查表达' }).click();
  await page.getByRole('textbox', { name: '搜索学习内容' }).fill('伝えば');
  await page.getByText('当前仅搜索已下载课程', { exact: false }).waitFor();
  await page.locator('.item-heading').filter({ hasText: '動詞のば形' }).waitFor();
  await context.setOffline(false);
  await page.getByText('1 条答题已保存，等待同步').waitFor({ state: 'hidden' });
  const history = await (await fetch(base + '/api/v1/review/history')).json();
  assert.equal(history.data.length, 1, '离线记录应该只写入一次');
  const lessons = await (await fetch(base + '/api/v1/lessons')).json();
  assert.equal(lessons.data[0].expression_count, 52);
  assert.equal(lessons.data[0].vocabulary_count, 106);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, '手机页面不得横向溢出');
  assert.deepEqual(failures, []);
  console.log(
    '手机浏览器检查通过：52 表达 / 106 单词、错误搜索、收藏筛选、下载、离线答题、刷新恢复、联网去重同步。',
  );
  console.log('截图目录：' + output);
  const httpContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const httpPage = await httpContext.newPage();
  httpPage.on('pageerror', (e) => failures.push(e.message));
  await httpPage.goto('http://shiro-mac-home:3002/review');
  assert.equal(
    await httpPage.evaluate(() => window.isSecureContext),
    false,
    'HTTP 主机名应为普通非安全上下文',
  );
  assert.equal(await httpPage.evaluate(() => typeof crypto.randomUUID), 'undefined');
  await httpPage.getByRole('button', { name: '领取今日卡片' }).click();
  await httpPage.getByRole('button', { name: '查看答案' }).click();
  await httpPage.getByRole('button', { name: '记住了 间隔复习' }).click();
  let count = 0;
  for (let i = 0; i < 100; i++) {
    count = (await (await fetch(base + '/api/v1/review/history')).json()).data.length;
    if (count === 2) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(count, 2, '普通 HTTP 也应成功保存并同步一次答题');
  assert.deepEqual(failures, []);
  await httpPage.goto('http://shiro-mac-home:3002/#/lessons');
  await httpPage.getByRole('heading', { name: '课堂与生活', exact: true }).waitFor();
  assert.equal(new URL(httpPage.url()).pathname, '/lessons');
  assert.equal(new URL(httpPage.url()).hash, '');
  const life = structuredClone(content);
  life.lesson.id = 'lesson_' + crypto.randomUUID();
  life.lesson.title = '生活摘录 · 分类验收';
  life.lesson.tags = ['生活摘录'];
  life.lesson.lesson_date = null;
  life.expressions = [
    { ...life.expressions[0], id: 'expr_' + crypto.randomUUID(), origin: 'assistant_supplement' },
  ];
  life.vocabulary = life.vocabulary.filter((w) =>
    life.expressions[0].vocabulary_ids.includes(w.id),
  );
  const lifeFolder = join(fixtureRoot, '2026-10-11_生活摘录');
  await mkdir(lifeFolder);
  await writeFile(join(lifeFolder, 'lesson.json'), JSON.stringify(life));
  await httpPage.getByRole('heading', { name: life.lesson.title, exact: true }).waitFor();
  await httpPage.getByRole('button', { name: '生活摘录', exact: true }).click();
  assert.equal(await httpPage.locator('.course-card').count(), 1);
  await httpPage.getByRole('heading', { name: life.lesson.title, exact: true }).waitFor();
  console.log('聊天生活摘录导入与独立分类检查通过。');
  await httpContext.close();
  console.log('普通 HTTP 主机名浏览器检查通过：无 randomUUID、无 Service Worker 时在线复习可用。');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null)
    await new Promise((r) => {
      server.once('exit', r);
      setTimeout(r, 3000);
    });
  await rm(fixtureRoot, { recursive: true, force: true });
}

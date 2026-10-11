import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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
  await page.goto(base + '/#/today');
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
  await httpPage.goto('http://shiro-mac-home:3002/#/review');
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
  await httpContext.close();
  console.log('普通 HTTP 主机名浏览器检查通过：无 randomUUID、无 Service Worker 时在线复习可用。');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

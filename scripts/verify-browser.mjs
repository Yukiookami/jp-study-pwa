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
const firstClass = (await readdir('lessons')).find((name) => name.includes('第一课'));
assert(firstClass, '第一课验收源不存在');
await cp(join('lessons', firstClass), join(fixtureRoot, firstClass), { recursive: true });
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
  await page.getByRole('heading', { name: /今天也整两句/ }).waitFor();
  await page.screenshot({ path: resolve(output, 'today.png'), fullPage: true });
  const narrowContext = await browser.newContext({
    viewport: { width: 320, height: 700 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const narrowPage = await narrowContext.newPage();
  await narrowPage.goto(base);
  await narrowPage.getByRole('heading', { name: /今天也整两句/ }).waitFor();
  assert.equal(
    await narrowPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    '320px 页面不应横向溢出',
  );
  await narrowPage.screenshot({ path: resolve(output, 'today-320.png'), fullPage: true });
  await narrowContext.close();
  await page.getByRole('link', { name: '查表达' }).click();
  await page.locator('.item-card').nth(19).waitFor();
  await page.locator('.load-more').scrollIntoViewIfNeeded();
  await page.locator('.item-card').nth(39).waitFor();
  assert.equal(await page.locator('.pagination').count(), 0, '不应显示翻页控件');
  await page.evaluate(() => scrollTo(0, 0));
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
  await page.getByText('还没找到，换个中文意思或日语说法试试？').waitFor();
  await page.getByRole('button', { name: '只看收藏', exact: true }).click();
  await page.getByRole('button', { name: '单词', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索学习内容' }).fill('しつ');
  const qualityCard = page
    .locator('.item-card')
    .filter({ has: page.locator('strong', { hasText: /^質$/ }) });
  await qualityCard.locator('.pitch-badge').getByText('⓪', { exact: true }).waitFor();
  await qualityCard.locator('.item-heading').click();
  await qualityCard.getByText('音调怎么看？', { exact: true }).click();
  await qualityCard.getByRole('link', { name: '东京大学 OJAD · 查看来源', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'word-pitch.png'), fullPage: true });
  await page.getByRole('button', { name: '表达方式', exact: true }).click();

  await page.getByRole('link', { name: '收集站', exact: true }).click();
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
  await page.getByRole('heading', { name: /今天也整两句/ }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/today');
  const missing = await fetch(base + '/api/v1/not-a-real-endpoint');
  assert.equal(missing.status, 404);
  assert((missing.headers.get('content-type') ?? '').includes('application/json'));

  await page.locator('.bottom-nav').getByRole('link', { name: '整两句', exact: true }).click();
  await page
    .locator('.hero')
    .getByRole('link', { name: /整两句|继续复习/ })
    .click();
  await page.getByRole('combobox', { name: '复习类型' }).selectOption('word');
  await page.getByRole('combobox', { name: '复习课程' }).selectOption(content.lesson.id);
  await page.screenshot({ path: resolve(output, 'review-setup.png'), fullPage: true });
  // Put an allocated word with a related theme first; queue selection order can vary.
  await page.route('**/api/v1/review/queue', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const themes = new Set(content.expressions.flatMap((item) => item.tags));
    const index = body.data.cards.findIndex((card) =>
      card.answer.tags.some((tag) => tag.startsWith('主题：') && themes.has(tag)),
    );
    assert(index >= 0, '验收队列需包含可查参考的卡片');
    const [card] = body.data.cards.splice(index, 1);
    body.data.cards.unshift(card);
    await route.fulfill({ response, json: body });
  });
  const queueRequest = page.waitForRequest(
    (req) => req.url().endsWith('/review/queue') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: '领取今日卡片' }).click();
  const queueBody = (await queueRequest).postDataJSON();
  assert.deepEqual(queueBody.card_types, ['word']);
  assert.equal(queueBody.lesson_id, content.lesson.id);

  await page.getByRole('button', { name: '查看答案' }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  const remainingBefore = await page.locator('.review-progress strong').textContent();
  await page.getByRole('button', { name: '查看答案', exact: true }).click();
  assert.equal(
    await page.locator('.review-progress strong').textContent(),
    remainingBefore,
    '看答案不减少剩余卡片',
  );
  assert.equal(await page.locator('.brand-mark').getAttribute('data-mood'), 'thinking');
  const reviewUrl = page.url();
  const reviewPrompt = await page.locator('.review-card h2').textContent();
  const relatedTrigger = page
    .locator('.answer')
    .getByRole('button', { name: /看相关表达/ })
    .first();
  await relatedTrigger.click();
  const referenceDialog = page.getByRole('dialog');
  await referenceDialog.waitFor();
  await referenceDialog.locator('.item-heading').first().waitFor();
  assert.equal(page.url(), reviewUrl, '查参考不能改变复习路由');
  await referenceDialog.getByText('当前仅查看已下载内容。', { exact: false }).waitFor();
  await referenceDialog.locator('.item-heading').first().click();
  await page.screenshot({ path: resolve(output, 'review-related.png'), fullPage: true });
  const activeTopic = await referenceDialog.locator('h2').textContent();
  await referenceDialog
    .getByRole('button', { name: activeTopic + ' · 看相关表达 →', exact: true })
    .first()
    .click();
  await referenceDialog.getByText('已经在看这个主题啦', { exact: true }).waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 1, '相同主题不能新增面板');
  assert.equal(
    await referenceDialog.locator('.item-heading').first().getAttribute('aria-expanded'),
    'true',
  );
  await referenceDialog
    .getByText('已经在看这个主题啦', { exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');

  await referenceDialog.getByRole('button', { name: '关闭相关表达', exact: true }).click();
  await referenceDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.review-card h2').textContent(), reviewPrompt);
  await page.getByRole('button', { name: '忘了 10 分钟后' }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: '查看答案', exact: true }).count(),
    0,
    '关掉参考后答案仍展开',
  );
  assert(
    await relatedTrigger.evaluate((el) => el === document.activeElement),
    '关闭后焦点回到原按钮',
  );
  await relatedTrigger.click();
  await referenceDialog.waitFor();
  await page.keyboard.press('Escape');
  await referenceDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', '关闭后恢复页面滚动');
  console.log('复习相关表达弹层：离线可读、关闭/返回焦点、答案不收起、队列与路由不变检查通过。');
  await page.screenshot({ path: resolve(output, 'review.png'), fullPage: true });
  await page.getByRole('button', { name: '忘了 10 分钟后' }).click();
  await page.waitForFunction(
    () => document.querySelector('.review-progress progress')?.getAttribute('value') === '1',
  );
  assert.equal(await page.locator('.review-progress progress').getAttribute('value'), '1');
  await page.getByText('1 条答题已保存，等待同步').waitFor();
  const nextPrompt = await page.locator('.review-card h2').textContent();
  await page.reload();
  await page.getByRole('heading', { name: /今天也整两句/ }).waitFor();
  await page
    .locator('.hero')
    .getByRole('link', { name: /整两句|继续复习/ })
    .click();
  await page.getByRole('button', { name: '查看答案' }).waitFor();
  assert.equal(
    await page.locator('.review-card h2').textContent(),
    nextPrompt,
    '刷新应保留剩余卡片',
  );
  assert.equal(
    await page.locator('.review-progress progress').getAttribute('value'),
    '1',
    '刷新恢复本次进度',
  );
  await page.getByRole('link', { name: '今日', exact: true }).click();
  await page.getByRole('link', { name: '查表达' }).click();
  await page.getByRole('textbox', { name: '搜索学习内容' }).fill('伝えば');
  await page.getByText('当前仅搜索已下载课程', { exact: false }).waitFor();
  await page.locator('.item-heading').filter({ hasText: '動詞のば形' }).waitFor();
  await page.getByRole('textbox', { name: '搜索学习内容' }).fill('');
  await page.locator('.item-card').nth(19).waitFor();
  await page.locator('.load-more').scrollIntoViewIfNeeded();
  await page.locator('.item-card').nth(39).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('textbox', { name: '搜索学习内容' }).fill('伝えば');
  await page.locator('.item-heading').filter({ hasText: '動詞のば形' }).waitFor();
  assert.equal(await page.locator('.item-card').count(), 1, '切换搜索应重置追加列表');
  console.log('在线/离线触底追加与搜索重置检查通过。');
  await context.setOffline(false);
  await page.getByText('1 条答题已保存，等待同步').waitFor({ state: 'hidden' });
  const history = await (await fetch(base + '/api/v1/review/history')).json();
  assert.equal(history.data.length, 1, '离线记录应该只写入一次');
  const lessons = await (await fetch(base + '/api/v1/lessons')).json();
  assert.equal(lessons.data[0].expression_count, 54);
  assert.equal(lessons.data[0].vocabulary_count, 106);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, '手机页面不得横向溢出');
  assert.deepEqual(failures, []);
  console.log(
    '手机浏览器检查通过：54 表达 / 106 单词、错误搜索、收藏筛选、下载、离线答题、刷新恢复、联网去重同步。',
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
  await httpPage.getByRole('heading', { name: '都是在哪学的？', exact: true }).waitFor();
  assert.equal(new URL(httpPage.url()).pathname, '/lessons');
  assert.equal(new URL(httpPage.url()).hash, '');
  const life = structuredClone(content);
  life.lesson.id = 'lesson_' + crypto.randomUUID();
  life.lesson.title = '生活摘录 · 分类验收';
  life.lesson.tags = ['生活摘录'];
  life.lesson.lesson_date = null;
  life.expressions = [
    {
      ...life.expressions.find((item) => item.japanese === '使わなくなりました'),
      id: 'expr_' + crypto.randomUUID(),
      origin: 'assistant_supplement',
    },
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
  await httpPage.goto('http://shiro-mac-home:3002/library');
  await httpPage.locator('.item-heading').first().waitFor();
  // Delay responses to verify the debounce gap and rapidly changing filters.
  const slowItems = async (route) => {
    const requestUrl = new URL(route.request().url());
    const response = await route.fetch({ url: base + requestUrl.pathname + requestUrl.search });
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response });
  };
  await httpPage.route('**/api/v1/items?*', slowItems);
  const topicFilter = httpPage.getByRole('combobox', { name: '主题与标签筛选' });
  const filterWidth = (await topicFilter.boundingBox()).width;
  const optionCount = await topicFilter.locator('option').count();
  const firstFilterRequest = httpPage.waitForRequest(
    (request) => new URL(request.url()).searchParams.get('tag') === '主题：状态变化',
  );
  await topicFilter.selectOption('主题：状态变化');
  await httpPage.locator('.list-skeleton').waitFor();
  assert.equal(await httpPage.locator('.library-results .empty').count(), 0);
  assert.equal(await httpPage.locator('.library-results').getAttribute('aria-busy'), 'true');
  assert(await topicFilter.isEnabled(), '加载时仍可切换筛选');
  assert(
    Math.abs((await topicFilter.boundingBox()).width - filterWidth) < 1,
    '骨架屏期间筛选宽度不变',
  );
  assert.equal(await topicFilter.locator('option').count(), optionCount, '加载时不移除主题选项');
  assert.equal(await topicFilter.inputValue(), '主题：状态变化');
  await httpPage.screenshot({ path: 'work/verification/filter-skeleton.png' });
  await firstFilterRequest;
  await topicFilter.selectOption('主题：気分転換');
  await httpPage.locator('.list-skeleton').waitFor();
  await httpPage.locator('.list-skeleton').waitFor({ state: 'hidden' });
  assert.deepEqual(await httpPage.locator('.topic-heading').allTextContents(), [
    '気分転換',
    'で的用法',
  ]);
  await httpPage.emulateMedia({ reducedMotion: 'reduce' });
  await topicFilter.selectOption('主题：状态变化');
  await httpPage.locator('.list-skeleton').waitFor();
  assert.equal(
    await httpPage
      .locator('.skeleton-line')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await httpPage.locator('.list-skeleton').waitFor({ state: 'hidden' });
  await httpPage.emulateMedia({ reducedMotion: 'no-preference' });
  await httpPage.unroute('**/api/v1/items?*', slowItems);
  await topicFilter.selectOption('');
  await httpPage.locator('.list-skeleton').waitFor();
  assert(
    Math.abs((await topicFilter.boundingBox()).width - filterWidth) < 1,
    '返回全部主题时宽度不变',
  );
  await httpPage.locator('.list-skeleton').waitFor({ state: 'hidden' });
  assert(Math.abs((await topicFilter.boundingBox()).width - filterWidth) < 1, '加载结束后宽度不变');
  console.log('慢网络筛选骨架屏、连续主题切换与减少动态效果检查通过。');
  await httpPage.getByRole('textbox', { name: '搜索学习内容' }).fill('使わなくなりました');
  await httpPage.locator('.item-heading').first().waitFor();
  await httpPage.locator('.item-heading').first().click();
  await httpPage.locator('.card-expand-enter-active').first().waitFor();
  await httpPage.locator('.card-expand-enter-active').waitFor({ state: 'hidden' });
  await httpPage.locator('.item-heading').first().click();
  await httpPage.locator('.card-expand-leave-active').first().waitFor();
  await httpPage.locator('.card-reveal').waitFor({ state: 'hidden' });
  await httpPage.locator('.item-heading').first().click();
  await httpPage.locator('.original-context').getByText('面霜', { exact: false }).first().waitFor();
  await httpPage
    .getByRole('button', { name: '状态变化 · 看相关表达 →', exact: true })
    .first()
    .click();
  await httpPage.locator('.list-skeleton').waitFor({ state: 'hidden' });
  assert.equal(new URL(httpPage.url()).search, '');
  const libraryDialog = httpPage.getByRole('dialog');
  await libraryDialog.waitFor();
  await libraryDialog.locator('.item-heading').first().waitFor();
  assert.equal(new URL(httpPage.url()).pathname, '/library');
  assert.equal(await topicFilter.inputValue(), '');
  assert.equal(
    await httpPage.getByRole('textbox', { name: '搜索学习内容' }).inputValue(),
    '使わなくなりました',
  );
  await libraryDialog.getByRole('button', { name: '关闭相关表达', exact: true }).click();
  await libraryDialog.waitFor({ state: 'hidden' });
  await httpPage.locator('.original-context').getByText('面霜', { exact: false }).first().waitFor();
  const related = await (
    await fetch(base + '/api/v1/items?type=expression&tag=' + encodeURIComponent('主题：状态变化'))
  ).json();
  assert(related.data.every((item) => item.tags.includes('主题：状态变化')));
  const sourceIds = new Set(
    related.data.flatMap((item) => item.lesson_sources.map((source) => source.id)),
  );
  assert(
    sourceIds.has(content.lesson.id) && sourceIds.has(life.lesson.id),
    '同主题必须跨课堂与生活来源',
  );
  assert(related.meta.available_tags.includes('主题：気分転換'), '主题筛选不能只来自当前分页');
  await httpPage.reload();
  await httpPage.getByRole('heading', { name: /今天也整两句/ }).waitFor();
  assert.equal(new URL(httpPage.url()).pathname, '/today');
  assert.equal(new URL(httpPage.url()).search, '');
  console.log('卡片展开/收起动画、在线主题弹层保留筛选与原卡片、刷新回首页及跨来源聚合检查通过。');
  // Reproduce old-server or cached source order: topic A, topic B, topic A.
  await httpPage.route('**/api/v1/lessons/' + content.lesson.id, async (route) => {
    const response = await route.fetch({ url: base + '/api/v1/lessons/' + content.lesson.id });
    const body = await response.json();
    const states = body.data.expressions.filter((item) => item.tags.includes('主题：状态变化'));
    const fit = body.data.expressions.find((item) => item.tags.includes('主题：适合自己'));
    assert(states.length > 1 && fit);
    const moved = new Set([states[0].id, fit.id, states[1].id]);
    body.data.expressions = [
      states[0],
      fit,
      states[1],
      ...body.data.expressions.filter((item) => !moved.has(item.id)),
    ];
    await route.fulfill({ response, json: body });
  });
  await httpPage.goto('http://shiro-mac-home:3002/lesson/' + content.lesson.id);
  await httpPage.locator('.item-heading').first().waitFor();
  assert.equal(
    await httpPage
      .locator('.topic-heading')
      .filter({ hasText: /^状态变化$/ })
      .count(),
    1,
    '乱序来源也只能出现一个状态变化分组',
  );
  console.log('旧服务/缓存乱序的主题重复标题回归检查通过。');

  const emptyContext = await browser.newContext();
  const emptyPage = await emptyContext.newPage();
  await emptyPage.route('**/api/v1/review/queue', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      json: { data: { queue_id: crypto.randomUUID(), cards: [], allocated_date: '2026-10-12' } },
    });
  });
  let otherPending = 0;
  await emptyPage.route('**/api/v1/home', async (route) => {
    await route.fulfill({
      json: { data: { due_count: 0, new_available: 0, pending_count: otherPending } },
    });
  });
  await emptyPage.goto(base + '/review');
  await emptyPage.getByRole('button', { name: '领取今日卡片' }).click();
  await emptyPage.getByRole('button', { name: '正在领卡片…' }).waitFor();
  await emptyPage.getByText('目前没有到期卡片，也没有可领的新卡。', { exact: false }).waitFor();
  otherPending = 10;
  await emptyPage.getByRole('combobox', { name: '复习类型' }).selectOption('word');
  await emptyPage.getByRole('button', { name: '再取一组' }).click();
  await emptyPage.getByText('还有 10 张已领取卡片待完成', { exact: false }).waitFor();
  const mixedRequest = emptyPage.waitForRequest(
    (request) => request.url().endsWith('/review/queue') && request.method() === 'POST',
  );
  await emptyPage.getByRole('button', { name: '切换到混合复习' }).click();
  const mixedBody = (await mixedRequest).postDataJSON();
  assert.equal(mixedBody.card_types, undefined);
  assert.equal(mixedBody.lesson_id, undefined);
  await emptyPage.getByText('还有 10 张已领取卡片待完成', { exact: false }).waitFor();
  await emptyContext.close();
  console.log('重新领取：加载提示、无新卡空队列反馈及切换混合复习检查通过。');
  const cancelContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const cancelPage = await cancelContext.newPage();
  await cancelPage.goto(base + '/settings');
  await cancelPage.getByRole('spinbutton', { name: '每日新卡数量' }).fill('20');
  await cancelPage.getByRole('button', { name: '就这么定了' }).click();
  await cancelPage.getByText('记好了，每天 20 张新卡！', { exact: true }).waitFor();
  await cancelPage.goto(base + '/review');
  await cancelPage.getByRole('button', { name: '领取今日卡片' }).click();
  await cancelPage.getByRole('button', { name: '查看答案' }).waitFor();
  const beforeCancel = (await (await fetch(base + '/api/v1/home')).json()).data;
  const historyBeforeCancel = await (await fetch(base + '/api/v1/review/history')).text();
  await cancelPage.getByRole('button', { name: '取消本组' }).click();
  await cancelPage.locator('.app-toast').getByText('本组已取消', { exact: false }).waitFor();
  await cancelPage.getByRole('button', { name: '领取今日卡片' }).waitFor();
  const afterCancel = (await (await fetch(base + '/api/v1/home')).json()).data;
  assert(afterCancel.new_available > beforeCancel.new_available, '取消后恢复未作答新卡额度');
  assert(
    afterCancel.pending_count < beforeCancel.pending_count,
    '取消后不再显示这些未作答新卡为待完成',
  );
  assert.equal(await (await fetch(base + '/api/v1/review/history')).text(), historyBeforeCancel);
  await cancelPage.reload();
  await cancelPage.getByRole('heading', { name: /今天也整两句/ }).waitFor();
  await cancelPage
    .locator('.hero')
    .getByRole('link', { name: /整两句|继续复习/ })
    .click();
  await cancelPage.getByRole('button', { name: '领取今日卡片' }).waitFor();
  await cancelContext.close();
  console.log('设置保存气泡与取消队列：额度退回、历史保留和刷新后队列清空检查通过。');
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

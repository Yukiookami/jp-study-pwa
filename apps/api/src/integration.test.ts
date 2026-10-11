import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LessonData } from '@jp-study/shared';
const enabled = process.env.RUN_DATABASE_TESTS === '1';
describe.skipIf(!enabled)('真实 PostgreSQL 导入、进度与 API', () => {
  let db: typeof import('./db.js').db,
    services: typeof import('./content.js'),
    review: typeof import('./review.js'),
    app: ReturnType<typeof import('./app.js').buildApp>,
    dir: string;
  const userId = '00000000-0000-0000-0000-000000000001';
  const lessonId = 'lesson_' + randomUUID(),
    exprId = 'expr_' + randomUUID(),
    wordId = 'vocab_' + randomUUID();
  const fixture: LessonData = {
    schema_version: 1,
    lesson: {
      id: lessonId,
      title: '测试第一课',
      lesson_date: '2026-10-11',
      created_date: '2026-10-11',
      source_files: [],
      tags: [],
    },
    expressions: [
      {
        id: exprId,
        japanese: '動詞のば形',
        meaning_zh: '如果传达',
        original_japanese: '伝えば',
        corrected_japanese: '伝えれば',
        explanation_zh: '一段动词去る加れば',
        contexts: ['条件'],
        vocabulary_ids: [wordId],
        origin: 'teacher_correction',
        verification: 'user_confirmed',
        tags: ['条件'],
        examples: [
          {
            japanese: '気持ちを伝えれば、分かってもらえます。',
            meaning_zh: '传达心意就能理解。',
            origin: 'assistant_supplement',
          },
        ],
      },
    ],
    vocabulary: [
      {
        id: wordId,
        japanese: '伝える',
        reading: 'つたえる',
        meaning_zh: '传达',
        part_of_speech: '一段动词',
        collocations: ['気持ちを伝える'],
        origin: 'lesson_material',
        verification: 'source_supported',
        tags: [],
        examples: [{ japanese: '気持ちを伝える。', meaning_zh: '传达心意。', origin: 'source' }],
      },
    ],
    unresolved: [],
  };
  const write = async (data: LessonData, folder = 'one') => {
    await mkdir(join(dir, folder), { recursive: true });
    await writeFile(join(dir, folder, 'lesson.json'), JSON.stringify(data));
  };
  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL!).pathname !== '/jp_study_test')
      throw new Error('测试只允许独立 jp_study_test 数据库');
    const module = await import('./db.js');
    db = module.db;
    await db.$executeRawUnsafe('TRUNCATE TABLE "User", "Lesson", "Vocabulary" CASCADE');
    await module.ensureUser();
    services = await import('./content.js');
    review = await import('./review.js');
    app = (await import('./app.js')).buildApp(false);
    dir = await mkdtemp(join(tmpdir(), 'jp-study-test-'));
    await write(fixture);
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('重复导入不重复建卡、错误搜索显示明确纠正', async () => {
    expect((await services.importLessons(dir)).succeeded).toBe(1);
    expect((await services.importLessons(dir)).unchanged).toBe(1);
    expect(await db.card.count()).toBe(3);
    const res = await app.inject('/api/v1/items?q=' + encodeURIComponent('伝えば'));
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].corrected_japanese).toBe('伝えれば');
  });
  it('并发领取不突破新卡额度；评分重试幂等、冲突拒绝', async () => {
    await db.user.update({ where: { id: userId }, data: { limit: 2 } });
    const now = new Date('2026-10-11T09:00:00Z');
    const [a, b] = await Promise.all([
      review.queue({ limit: 20 }, now),
      review.queue({ limit: 20 }, now),
    ]);
    expect(a.cards).toHaveLength(2);
    expect(b.cards).toHaveLength(2);
    expect(await db.allocation.count()).toBe(2);
    const correction = a.cards.find((c) => c.card_type === 'correction')!;
    expect(correction.answer.japanese).toBe('伝えれば');
    const event = {
      event_id: randomUUID(),
      card_id: correction.id,
      rating: 'remembered' as const,
      answered_at: now.toISOString(),
      device_id: randomUUID(),
      algorithm_version: 1 as const,
    };
    const results = await Promise.all([
      review.acceptEvent(event, now),
      review.acceptEvent(event, now),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['accepted', 'duplicate']);
    expect(await db.reviewEvent.count()).toBe(1);
    expect((await review.stateFor(correction.id))?.version).toBe(1);
    await expect(review.acceptEvent({ ...event, rating: 'forgot' }, now)).rejects.toThrow(
      '不同内容',
    );
    const unallocated = await db.card.findFirstOrThrow({ where: { allocations: { none: {} } } });
    await expect(
      review.acceptEvent({ ...event, event_id: randomUUID(), card_id: unallocated.id }, now),
    ).rejects.toThrow('先领取');
  });
  it('词条冲突整课回滚；更新保留收藏、卡 ID 和进度', async () => {
    await db.favorite.create({
      data: { userId, itemType: 'expression', itemId: exprId, expressionId: exprId },
    });
    const bad = structuredClone(fixture);
    bad.lesson.title = '不应写入';
    bad.vocabulary[0]!.reading = '错误';
    await write(bad);
    expect((await services.importLessons(dir)).failed).toBe(1);
    expect((await db.lesson.findUniqueOrThrow({ where: { id: lessonId } })).title).toBe(
      '测试第一课',
    );
    const cards = await db.card.findMany();
    const good = structuredClone(fixture);
    good.expressions[0]!.explanation_zh += '。补充说明';
    await write(good);
    expect((await services.importLessons(dir)).succeeded).toBe(1);
    expect((await db.card.findMany()).map((c) => c.id).sort()).toEqual(
      cards.map((c) => c.id).sort(),
    );
    expect(await db.favorite.count()).toBe(1);
    expect(await db.reviewEvent.count()).toBe(1);
    expect((await db.reviewState.findFirstOrThrow()).version).toBe(1);
  });
  it('共享单词合并来源例句；待确认表达不建卡；坏文件不阻塞好课', async () => {
    const second = structuredClone(fixture);
    second.lesson.id = 'lesson_' + randomUUID();
    second.lesson.title = '测试第二课';
    second.lesson.tags = ['生活摘录'];
    second.expressions[0]!.id = 'expr_' + randomUUID();
    second.expressions[0]!.verification = 'needs_review';
    second.vocabulary[0]!.examples.push({
      japanese: '考えを伝える。',
      meaning_zh: '传达想法。',
      origin: 'source',
    });
    await write(second, 'two');
    await mkdir(join(dir, 'broken'));
    await writeFile(join(dir, 'broken', 'lesson.json'), '{bad');
    const report = await services.importLessons(dir);
    expect(report.failed).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(await db.card.count()).toBe(3);
    const item = (await services.content()).items.find((i) => i.id === wordId)!;
    expect(item.lesson_sources).toHaveLength(2);
    expect(item.lesson_sources.find((l) => l.id === second.lesson.id)?.kind).toBe('life');
    expect(item.examples).toHaveLength(2);
    const removed = structuredClone(fixture);
    removed.expressions = [];
    await write(removed);
    await services.importLessons(dir);
    expect(await db.card.count({ where: { itemType: 'expression', active: true } })).toBe(0);
    expect(await db.reviewEvent.count()).toBe(1);
    expect(await db.favorite.count()).toBe(1);
  });
  it('重复课程源拒绝两份，保留已有内容与学习记录', async () => {
    const old = await db.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    const duplicate = structuredClone(fixture);
    duplicate.lesson.title = '不允许覆盖';
    await write(duplicate, 'duplicate');
    const report = await services.importLessons(dir);
    expect(report.failed).toBe(3);
    expect((await db.lesson.findUniqueOrThrow({ where: { id: lessonId } })).version).toBe(
      old.version,
    );
    expect(await db.reviewEvent.count()).toBe(1);
    await rm(join(dir, 'duplicate'), { recursive: true });
  });
  it('API 校验与批次单条拒绝；历史不暴露模型与凭据', async () => {
    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      payload: { daily_new_limit: 101 },
    });
    expect(invalid.statusCode).toBe(400);
    const cards = await review.queue({ limit: 20 }, new Date('2026-10-12T09:00:00Z'));
    expect(cards.cards[0]!.card_type).toBe('word');
    const event = {
      event_id: randomUUID(),
      card_id: cards.cards[0]!.id,
      rating: 'partial',
      answered_at: new Date().toISOString(),
      device_id: randomUUID(),
      algorithm_version: 1,
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/review/events',
      payload: { events: [{ ...event, event_id: randomUUID(), card_id: randomUUID() }, event] },
    });
    expect(res.json().data.results.map((r: { status: string }) => r.status)).toEqual([
      'rejected',
      'accepted',
    ]);
    const history = await app.inject('/api/v1/review/history');
    expect(history.statusCode).toBe(200);
    expect(history.body).not.toContain('payloadHash');
  });
});

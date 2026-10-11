import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import type { LessonDetail } from '@jp-study/shared';
vi.mock('./api', () => ({ http: { get: vi.fn() } }));
import { http } from './api';
import { refreshDownloaded } from './content-sync';
import { saveLesson, downloaded, recordAnswer, pending, session } from './storage';
it('下载副本按版本刷新，失败保留旧内容且不清理待同步答题或进行中的队列', async () => {
  const old: LessonDetail = {
    lesson: {
      id: 'lesson_' + crypto.randomUUID(),
      title: '生活摘录',
      lesson_date: null,
      created_date: '2026-10-11',
      source_files: [],
      tags: ['生活摘录'],
    },
    expressions: [],
    vocabulary: [],
    memo_markdown: '旧内容',
    content_version: 'old',
    unresolved: [],
  };
  await saveLesson(old);
  const queue = { queue_id: crypto.randomUUID(), cards: [], allocated_date: '2026-10-11' };
  await recordAnswer(
    {
      event_id: crypto.randomUUID(),
      card_id: crypto.randomUUID(),
      rating: 'partial',
      answered_at: new Date().toISOString(),
      device_id: crypto.randomUUID(),
      algorithm_version: 1,
    },
    queue,
  );
  vi.mocked(http.get).mockResolvedValue({
    data: { data: [{ id: old.lesson.id, content_version: 'new' }], meta: { total: 1 } },
  });
  await expect(
    refreshDownloaded(async () => {
      throw new Error('连接中断');
    }),
  ).rejects.toThrow('连接中断');
  expect((await downloaded())[0]!.content_version).toBe('old');
  expect(
    await refreshDownloaded(async () => ({
      ...old,
      content_version: 'new',
      memo_markdown: '更新内容',
    })),
  ).toEqual([old.lesson.id]);
  expect((await downloaded())[0]!.memo_markdown).toBe('更新内容');
  expect(await pending()).toHaveLength(1);
  expect(await session()).toEqual(queue);
});

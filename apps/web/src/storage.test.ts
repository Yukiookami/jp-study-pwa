import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { reactive } from 'vue';
import { randomUUID } from 'node:crypto';
import { recordAnswer, pending, session, acknowledge } from './storage';
it('离线答题与剩余队列一起持久化；只删除已接受或重复的事件', async () => {
  const event = {
    event_id: randomUUID(),
    card_id: randomUUID(),
    rating: 'forgot' as const,
    answered_at: new Date().toISOString(),
    device_id: randomUUID(),
    algorithm_version: 1 as const,
  };
  const queue = { queue_id: randomUUID(), cards: [], allocated_date: '2026-10-11' };
  await recordAnswer(event, reactive(queue));
  expect(await session()).toEqual(queue);
  expect(await pending()).toHaveLength(1);
  await acknowledge([{ event_id: event.event_id, status: 'rejected', error: '稍后处理' }]);
  expect(await pending()).toHaveLength(1);
  await acknowledge([{ event_id: event.event_id, status: 'duplicate' }]);
  expect(await pending()).toHaveLength(0);
});

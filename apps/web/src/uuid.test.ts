import { it, expect } from 'vitest';
import { newEventId } from './uuid';
it('HTTP 没有 randomUUID 时仍生成不同的合法 v4 答题编号', () => {
  const random = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  const ids = Array.from({ length: 100 }, () => newEventId(random));
  expect(new Set(ids).size).toBe(100);
  for (const id of ids)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

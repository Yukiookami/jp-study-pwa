import { describe, it, expect } from 'vitest';
import { nextReview, dayInTokyo, LessonSchema } from './index.js';
describe('review scheduling', () => {
  const now = new Date('2026-10-11T15:00:00Z');
  it('keeps midnight in Tokyo independent of host timezone', () =>
    expect(dayInTokyo(now)).toBe('2026-10-12'));
  it('forgot resets and retries in ten minutes', () =>
    expect(nextReview(3, 'forgot', now)).toEqual({
      stage: 0,
      next_due_at: new Date('2026-10-11T15:10:00Z'),
    }));
  it('first remembered review is one day then grows', () => {
    expect(nextReview(0, 'remembered', now).next_due_at.getTime() - now.getTime()).toBe(86400000);
    expect(nextReview(4, 'remembered', now).stage).toBe(4);
    expect(nextReview(4, 'partial', now).stage).toBe(4);
  });
  it('rejects invalid dates', () =>
    expect(
      LessonSchema.safeParse({
        schema_version: 1,
        lesson: {
          id: 'lesson_00000000-0000-0000-0000-000000000001',
          title: 'x',
          lesson_date: '2026-02-30',
          created_date: '2026-10-11',
          source_files: [],
          tags: [],
        },
        expressions: [],
        vocabulary: [],
        unresolved: [],
      }).success,
    ).toBe(false));
});

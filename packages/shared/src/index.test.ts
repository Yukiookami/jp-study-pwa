import { describe, it, expect } from 'vitest';
import {
  nextReview,
  dayInTokyo,
  LessonSchema,
  groupLearningItems,
  VocabularySchema,
  moraCount,
  pitchAccentLabel,
} from './index.js';
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

it('groups related learning across lesson and life sources without changing their identity or input order', () => {
  const lesson = { id: 'lesson-expression', tags: ['主题：状态变化'], source: 'lesson' };
  const life = { id: 'life-expression', tags: ['主题：状态变化'], source: 'life' };
  const other = { id: 'other', tags: ['主题：爱好与活动'], source: 'lesson' };
  const original = [lesson, other, life];
  const grouped = groupLearningItems(original);
  expect(grouped.filter((x) => x.tags.includes('主题：状态变化'))).toEqual([lesson, life]);
  expect(grouped.indexOf(life) - grouped.indexOf(lesson)).toBe(1);
  expect(original).toEqual([lesson, other, life]);
});

it('preserves verified accent and rejects impossible or undocumented patterns without breaking old words', () => {
  const word = {
    id: 'vocab_00000000-0000-0000-0000-000000000001',
    japanese: '掴む',
    reading: 'つかむ',
    part_of_speech: '五段他动词',
    meaning_zh: '抓住',
    collocations: [],
    tags: [],
    origin: 'assistant_supplement',
    verification: 'source_supported',
    examples: [
      { japanese: '意味を掴む。', meaning_zh: '理解意思。', origin: 'assistant_supplement' },
    ],
  };
  expect(VocabularySchema.safeParse(word).success).toBe(true);
  const accent = {
    dialect: '东京式',
    patterns: [2],
    source: { title: 'OJAD', url: 'https://www.gavo.t.u-tokyo.ac.jp/ojad/' },
  };
  expect(VocabularySchema.parse({ ...word, pitch_accent: accent }).pitch_accent).toEqual(accent);
  for (const patterns of [[4], [-1], [1.5], [2, 2], []]) {
    expect(
      VocabularySchema.safeParse({ ...word, pitch_accent: { ...accent, patterns } }).success,
    ).toBe(false);
  }
  expect(VocabularySchema.safeParse({ ...word, pitch_accent: { patterns: [2] } }).success).toBe(
    false,
  );
  expect(moraCount('きょう')).toBe(2);
  expect(moraCount('クオリティ')).toBe(4);
  expect(moraCount('きって')).toBe(3);
  expect(pitchAccentLabel(0)).toBe('⓪');
  expect(pitchAccentLabel(2)).toBe('②');
});

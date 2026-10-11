import { z } from 'zod';
const id = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`));
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const Origin = z.enum(['teacher_correction', 'lesson_material', 'assistant_supplement']);
export const Verification = z.enum(['source_supported', 'user_confirmed', 'needs_review']);
export const ExampleSchema = z.object({
  japanese: z.string().min(1),
  meaning_zh: z.string().min(1),
  origin: z.enum(['source', 'assistant_supplement']),
});
const common = {
  japanese: z.string().min(1),
  meaning_zh: z.string().min(1),
  examples: z.array(ExampleSchema).min(1),
  origin: Origin,
  verification: Verification,
  tags: z.array(z.string()),
};
export const ExpressionSchema = z.object({
  ...common,
  id: id('expr'),
  original_japanese: z.string().nullable(),
  error_example_japanese: z.string().nullable().optional(),
  corrected_japanese: z.string().nullable().optional(),
  explanation_zh: z.string(),
  contexts: z.array(z.string()),
  vocabulary_ids: z.array(id('vocab')),
});
export const VocabularySchema = z.object({
  ...common,
  id: id('vocab'),
  reading: z.string().min(1),
  part_of_speech: z.string().min(1),
  collocations: z.array(z.string()),
});
export const LessonSchema = z
  .object({
    schema_version: z.literal(1),
    lesson: z.object({
      id: id('lesson'),
      title: z.string().min(1),
      lesson_date: date.nullable(),
      created_date: date,
      source_files: z.array(z.string()),
      tags: z.array(z.string()),
    }),
    expressions: z.array(ExpressionSchema),
    vocabulary: z.array(VocabularySchema),
    unresolved: z.array(
      z.object({
        description_zh: z.string(),
        related_item_ids: z.array(z.string()),
        source_excerpt: z.string().nullable(),
      }),
    ),
  })
  .superRefine((d, ctx) => {
    const ids = [d.lesson.id, ...d.expressions.map((e) => e.id), ...d.vocabulary.map((v) => v.id)];
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '条目 ID 重复' });
    const vocab = new Set(d.vocabulary.map((v) => v.id));
    if (d.expressions.some((e) => e.vocabulary_ids.some((v) => !vocab.has(v))))
      ctx.addIssue({ code: 'custom', message: '词条引用不存在' });
    if (d.unresolved.some((u) => u.related_item_ids.some((id) => !ids.includes(id))))
      ctx.addIssue({ code: 'custom', message: '待确认引用不存在' });
  });
export type LessonData = z.infer<typeof LessonSchema>;
export type Expression = z.infer<typeof ExpressionSchema>;
export type Vocabulary = z.infer<typeof VocabularySchema>;
export type Example = z.infer<typeof ExampleSchema>;
export const RatingSchema = z.enum(['forgot', 'partial', 'remembered']);
export type Rating = z.infer<typeof RatingSchema>;
export const ReviewEventSchema = z
  .object({
    event_id: z.uuid(),
    card_id: z.uuid(),
    rating: RatingSchema,
    answered_at: z.iso.datetime(),
    device_id: z.uuid(),
    algorithm_version: z.literal(1),
  })
  .strict();
export const EventsSchema = z
  .object({ events: z.array(ReviewEventSchema).min(1).max(100) })
  .strict();
export type ReviewInput = z.infer<typeof ReviewEventSchema>;
export const QueueSchema = z
  .object({
    lesson_id: id('lesson').optional(),
    card_types: z
      .array(z.enum(['word', 'expression', 'correction']))
      .min(1)
      .optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
export const SettingsSchema = z
  .object({ daily_new_limit: z.number().int().min(0).max(100) })
  .strict();
export const ItemTypeSchema = z.enum(['expression', 'vocabulary']);
export type ItemType = z.infer<typeof ItemTypeSchema>;
export const SearchSchema = z
  .object({
    q: z.string().max(100).default(''),
    type: ItemTypeSchema.optional(),
    lesson_id: z.string().optional(),
    tag: z.string().optional(),
    favorite: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const HistorySchema = SearchSchema.pick({ page: true, page_size: true }).extend({
  card_id: z.uuid().optional(),
});
export type LessonSummary = {
  id: string;
  title: string;
  lesson_date: string | null;
  expression_count: number;
  vocabulary_count: number;
  content_version: string;
};
export type Item = (Expression | Vocabulary) & {
  item_type: ItemType;
  favorited: boolean;
  lesson_sources: LessonSummary[];
};
export type LessonDetail = {
  lesson: LessonData['lesson'];
  expressions: Item[];
  vocabulary: Item[];
  memo_markdown: string;
  content_version: string;
  unresolved: LessonData['unresolved'];
};
export type Card = {
  id: string;
  item_type: ItemType;
  item_id: string;
  card_type: 'word' | 'expression' | 'correction';
  prompt: string;
  error_kind?: 'original' | 'inferred';
  answer: Item;
  source_lesson_ids: string[];
  verification: z.infer<typeof Verification>;
};
export type Queue = { queue_id: string; cards: Card[]; allocated_date: string };
export type State = {
  card_id: string;
  stage: number;
  last_rating: Rating;
  last_reviewed_at: string;
  next_due_at: string;
  version: number;
};
export type EventResult = {
  event_id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  state?: State;
  error?: string;
};
export const normalize = (v: string) => v.normalize('NFKC').toLocaleLowerCase();
export function matches(item: Item, q: string) {
  return normalize(JSON.stringify(item)).includes(normalize(q));
}
export function dayInTokyo(now: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function nextReview(stage: number, rating: Rating, now: Date) {
  const safe = Math.max(0, Math.min(4, stage));
  const days = [1, 3, 7, 14, 30];
  const delay =
    rating === 'forgot' ? 600000 : rating === 'partial' ? 86400000 : days[safe]! * 86400000;
  return {
    stage: rating === 'forgot' ? 0 : rating === 'partial' ? safe : Math.min(4, safe + 1),
    next_due_at: new Date(now.getTime() + delay),
  };
}

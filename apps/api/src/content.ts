import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import {
  LessonSchema,
  type LessonData,
  type Item,
  type LessonSummary,
  type LessonDetail,
  type Expression,
  type Vocabulary,
} from '@jp-study/shared';
import { db, lock, asJson, userId } from './db.js';
import { lessonsRoot } from './config.js';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'REQUEST_FAILED',
  ) {
    super(message);
  }
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function importLessons(directory = lessonsRoot) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new AppError(503, '课程目录暂时不可读，已有课程仍可使用', 'LESSONS_UNAVAILABLE');
  }
  const results: { name: string; status: 'updated' | 'unchanged' | 'failed'; message?: string }[] =
    [];
  const base = await realpath(directory);
  const directories = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = new Map<string, number>();
  for (const entry of directories) {
    try {
      const path = await realpath(join(directory, entry.name, 'lesson.json'));
      const rel = relative(base, path);
      if (rel.startsWith('..') || isAbsolute(rel)) continue;
      const parsed = LessonSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
      if (parsed.success)
        counts.set(parsed.data.lesson.id, (counts.get(parsed.data.lesson.id) ?? 0) + 1);
    } catch {
      /* report invalid files below */
    }
  }
  for (const entry of directories) {
    try {
      const folder = await realpath(join(directory, entry.name));
      const diff = relative(base, folder);
      if (diff.startsWith('..') || isAbsolute(diff))
        throw new AppError(422, '课程路径不在配置目录中');
      const inputFile = await realpath(join(folder, 'lesson.json'));
      const fileDiff = relative(base, inputFile);
      if (fileDiff.startsWith('..') || isAbsolute(fileDiff))
        throw new AppError(422, '课程文件路径无效');
      const parsed = LessonSchema.safeParse(JSON.parse(await readFile(inputFile, 'utf8')));
      if (!parsed.success)
        throw new AppError(
          422,
          '课程格式错误：' +
            parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .slice(0, 3)
              .join('；'),
        );
      const data = parsed.data;
      if ((counts.get(data.lesson.id) ?? 0) > 1)
        throw new AppError(409, '多个课程目录使用相同 lesson ID，请保留唯一课程源');
      let memo = '';
      try {
        const path = await realpath(join(folder, 'memo.md'));
        const rel = relative(base, path);
        if (!rel.startsWith('..') && !isAbsolute(rel)) memo = await readFile(path, 'utf8');
      } catch {
        /* memo is optional; JSON remains source of structured content */
      }
      const version = hash({ data, memo, importer_version: 2 });
      const status = await db.$transaction(
        async (tx) => {
          await lock(tx);
          const previous = await tx.lesson.findUnique({ where: { id: data.lesson.id } });
          if (previous?.version === version) return 'unchanged' as const;
          await tx.lesson.upsert({
            where: { id: data.lesson.id },
            create: {
              id: data.lesson.id,
              title: data.lesson.title,
              data: asJson({ ...data.lesson, unresolved: data.unresolved }),
              memo,
              version,
            },
            update: {
              title: data.lesson.title,
              data: asJson({ ...data.lesson, unresolved: data.unresolved }),
              memo,
              version,
              importedAt: new Date(),
            },
          });
          await tx.expression.updateMany({
            where: { lessonId: data.lesson.id },
            data: { active: false },
          });
          await tx.lessonWord.updateMany({
            where: { lessonId: data.lesson.id },
            data: { active: false },
          });
          for (const w of data.vocabulary) {
            const old = await tx.vocabulary.findUnique({ where: { id: w.id } });
            if (
              old &&
              (old.japanese !== w.japanese ||
                old.reading !== w.reading ||
                old.meaning !== w.meaning_zh)
            )
              throw new AppError(
                409,
                `词条「${w.japanese}」编号对应的读音或义项冲突，请核对源文件`,
              );
            await tx.vocabulary.upsert({
              where: { id: w.id },
              create: { id: w.id, japanese: w.japanese, reading: w.reading, meaning: w.meaning_zh },
              update: {},
            });
            await tx.lessonWord.upsert({
              where: { lessonId_vocabularyId: { lessonId: data.lesson.id, vocabularyId: w.id } },
              create: { lessonId: data.lesson.id, vocabularyId: w.id, data: asJson(w) },
              update: { data: asJson(w), active: true },
            });
          }
          for (const e of data.expressions) {
            const old = await tx.expression.findUnique({ where: { id: e.id } });
            if (old && old.lessonId !== data.lesson.id)
              throw new AppError(409, '表达编号已属于另一节课，请核对源文件');
            await tx.expression.upsert({
              where: { id: e.id },
              create: { id: e.id, lessonId: data.lesson.id, data: asJson(e) },
              update: { data: asJson(e), active: true },
            });
            await tx.expressionWord.deleteMany({ where: { expressionId: e.id } });
            if (e.vocabulary_ids.length)
              await tx.expressionWord.createMany({
                data: e.vocabulary_ids.map((vocabularyId) => ({
                  expressionId: e.id,
                  vocabularyId,
                })),
              });
          }
          // Recompute eligibility, retaining existing Card IDs and all progress/history.
          await tx.card.updateMany({ data: { active: false } });
          for (const e of await tx.expression.findMany({ where: { active: true } })) {
            const data = e.data as unknown as Expression;
            if (data.verification === 'needs_review') continue;
            const types = ['expression'];
            if ((data.original_japanese || data.error_example_japanese) && data.corrected_japanese)
              types.push('correction');
            for (const cardType of types)
              await tx.card.upsert({
                where: {
                  itemType_itemId_cardType: { itemType: 'expression', itemId: e.id, cardType },
                },
                create: { itemType: 'expression', itemId: e.id, cardType, expressionId: e.id },
                update: { active: true },
              });
          }
          for (const w of await tx.vocabulary.findMany({
            where: { sources: { some: { active: true } } },
            include: { sources: { where: { active: true } } },
          })) {
            if (
              !w.sources.some(
                (s) => (s.data as unknown as Vocabulary).verification !== 'needs_review',
              )
            )
              continue;
            await tx.card.upsert({
              where: {
                itemType_itemId_cardType: {
                  itemType: 'vocabulary',
                  itemId: w.id,
                  cardType: 'word',
                },
              },
              create: {
                itemType: 'vocabulary',
                itemId: w.id,
                cardType: 'word',
                vocabularyId: w.id,
              },
              update: { active: true },
            });
          }
          return 'updated' as const;
        },
        { timeout: 60000, maxWait: 60000 },
      );
      results.push({ name: entry.name, status });
    } catch (error) {
      results.push({
        name: entry.name,
        status: 'failed',
        message: error instanceof AppError ? error.message : '课程无法读取或解析，请检查 JSON 文件',
      });
    }
  }
  return {
    results,
    succeeded: results.filter((r) => r.status === 'updated').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
}
export async function content() {
  const [lessons, expressions, words, favorites] = await Promise.all([
    db.lesson.findMany({ orderBy: { importedAt: 'desc' } }),
    db.expression.findMany({ where: { active: true } }),
    db.vocabulary.findMany({
      where: { sources: { some: { active: true } } },
      include: { sources: { where: { active: true } } },
    }),
    db.favorite.findMany({ where: { userId } }),
  ]);
  const summaries: LessonSummary[] = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    lesson_date: (l.data as any).lesson_date,
    expression_count: expressions.filter((e) => e.lessonId === l.id).length,
    vocabulary_count: words.filter((w) => w.sources.some((s) => s.lessonId === l.id)).length,
    content_version: l.version,
  }));
  const favoriteIds = new Set(favorites.map((f) => `${f.itemType}:${f.itemId}`));
  const items: Item[] = [
    ...expressions.map((e) => ({
      ...(e.data as unknown as Expression),
      item_type: 'expression' as const,
      favorited: favoriteIds.has(`expression:${e.id}`),
      lesson_sources: summaries.filter((l) => l.id === e.lessonId),
    })),
    ...words.map((w) => {
      const sources = w.sources.map((s) => s.data as unknown as Vocabulary);
      const primary = sources.find((s) => s.verification !== 'needs_review') ?? sources[0]!;
      const examples = [
        ...new Map(sources.flatMap((s) => s.examples).map((e) => [JSON.stringify(e), e])).values(),
      ];
      return {
        ...primary,
        collocations: [...new Set(sources.flatMap((s) => s.collocations))],
        tags: [...new Set(sources.flatMap((s) => s.tags))],
        examples,
        item_type: 'vocabulary' as const,
        favorited: favoriteIds.has(`vocabulary:${w.id}`),
        lesson_sources: summaries.filter((l) => w.sources.some((s) => s.lessonId === l.id)),
      };
    }),
  ];
  return { lessons, summaries, items };
}
export async function lessonDetail(id: string): Promise<LessonDetail> {
  const all = await content();
  const lesson = all.lessons.find((l) => l.id === id);
  if (!lesson) throw new AppError(404, '没有找到这节课');
  const ownWords = await db.lessonWord.findMany({ where: { lessonId: id, active: true } });
  const vocabulary = ownWords.map((s) => ({
    ...(s.data as unknown as Vocabulary),
    item_type: 'vocabulary' as const,
    favorited: all.items.find((i) => i.id === s.vocabularyId)?.favorited ?? false,
    lesson_sources: all.summaries.filter((l) => l.id === id),
  }));
  return {
    lesson: lesson.data as unknown as LessonData['lesson'],
    expressions: all.items.filter(
      (i) => i.item_type === 'expression' && i.lesson_sources.some((l) => l.id === id),
    ),
    vocabulary,
    unresolved: (lesson.data as any).unresolved ?? [],
    memo_markdown: lesson.memo,
    content_version: lesson.version,
  };
}

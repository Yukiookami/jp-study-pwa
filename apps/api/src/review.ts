import { randomUUID, createHash } from 'node:crypto';
import {
  dayInTokyo,
  nextReview,
  type Queue,
  type Card as PublicCard,
  type ReviewInput,
  type EventResult,
  type State,
  type Rating,
  type Expression,
} from '@jp-study/shared';
import { db, asJson, lock, userId } from './db.js';
import { content, AppError } from './content.js';
const payloadHash = (event: ReviewInput) =>
  createHash('sha256').update(JSON.stringify(event)).digest('hex');
export async function queue(
  input: { lesson_id?: string; card_types?: string[]; limit: number },
  now = new Date(),
): Promise<Queue> {
  const all = await content();
  const byId = new Map(all.items.map((i) => [`${i.item_type}:${i.id}`, i]));
  const selected = await db.$transaction(
    async (tx) => {
      await lock(tx);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const day = dayInTokyo(now);
      const cards = await tx.card.findMany({
        where: {
          active: true,
          ...(input.card_types ? { cardType: { in: input.card_types } } : {}),
        },
        include: { states: { where: { userId } }, allocations: { where: { userId } } },
        orderBy: { id: 'asc' },
      });
      const candidates = cards.filter((c) => {
        const item = byId.get(`${c.itemType}:${c.itemId}`);
        return (
          item && (!input.lesson_id || item.lesson_sources.some((l) => l.id === input.lesson_id))
        );
      });
      const due = candidates
        .filter((c) => c.states[0]?.dueAt && c.states[0].dueAt <= now)
        .sort((a, b) => a.states[0]!.dueAt!.getTime() - b.states[0]!.dueAt!.getTime());
      const allocated = candidates.filter(
        (c) => !c.states[0]?.reviewedAt && c.allocations.length > 0,
      );
      const used = await tx.allocation.count({ where: { userId, day } });
      const result = [...due, ...allocated].slice(0, input.limit);
      const freshCandidates = candidates.filter(
        (c) => !c.states[0]?.reviewedAt && !c.allocations.length,
      );
      const groups = ['correction', 'word', 'expression'].map((type) =>
        freshCandidates.filter((c) => c.cardType === type),
      );
      const mixed: typeof freshCandidates = [];
      for (let i = 0; i < Math.max(...groups.map((g) => g.length)); i++)
        for (const group of groups) if (group[i]) mixed.push(group[i]!);
      const fresh = mixed.slice(
        0,
        Math.max(0, Math.min(input.limit - result.length, user.limit - used)),
      );
      for (const c of fresh) await tx.allocation.create({ data: { userId, cardId: c.id, day } });
      return [...result, ...fresh];
    },
    { timeout: 30000, maxWait: 30000 },
  );
  const cards: PublicCard[] = selected.map((c) => {
    const item = byId.get(`${c.itemType}:${c.itemId}`)!;
    const e = item as Expression;
    const error = e.original_japanese ?? e.error_example_japanese;
    return {
      id: c.id,
      item_type: item.item_type,
      item_id: item.id,
      card_type: c.cardType as PublicCard['card_type'],
      prompt:
        c.cardType === 'word'
          ? item.japanese
          : c.cardType === 'correction'
            ? error!
            : item.meaning_zh,
      ...(c.cardType === 'correction'
        ? { error_kind: e.original_japanese ? ('original' as const) : ('inferred' as const) }
        : {}),
      answer: {
        ...item,
        ...(c.cardType === 'correction' ? { japanese: e.corrected_japanese! } : {}),
      },
      source_lesson_ids: item.lesson_sources.map((l) => l.id),
      verification: item.verification,
    };
  });
  return { queue_id: randomUUID(), cards, allocated_date: dayInTokyo(now) };
}
export async function cancelQueue(cardIds: string[]) {
  return db.$transaction(
    async (tx) => {
      await lock(tx);
      const released = await tx.allocation.deleteMany({
        where: {
          userId,
          cardId: { in: cardIds },
          card: {
            events: { none: { userId } },
            states: { none: { userId, reviewedAt: { not: null } } },
          },
        },
      });
      return { released_new_cards: released.count };
    },
    { timeout: 30000, maxWait: 30000 },
  );
}
export async function acceptEvent(event: ReviewInput, now = new Date()): Promise<EventResult> {
  return db.$transaction(
    async (tx) => {
      await lock(tx);
      const hash = payloadHash(event);
      const previous = await tx.reviewEvent.findUnique({ where: { id: event.event_id } });
      if (previous) {
        if (previous.payloadHash !== hash)
          throw new AppError(409, '同一个答题编号包含不同内容，请检查待同步记录');
        return {
          event_id: event.event_id,
          status: 'duplicate',
          state: previous.result as unknown as State,
        };
      }
      const card = await tx.card.findUnique({ where: { id: event.card_id } });
      if (!card?.active) throw new AppError(409, '这张卡片暂不可复习，答题记录已保留待处理');
      const allocation = await tx.allocation.findUnique({
        where: { userId_cardId: { userId, cardId: card.id } },
      });
      if (!allocation) throw new AppError(409, '请先领取这张卡片');
      const old = await tx.reviewState.findUnique({
        where: { userId_cardId: { userId, cardId: event.card_id } },
      });
      const next = nextReview(old?.stage ?? 0, event.rating, now);
      const state: State = {
        card_id: card.id,
        stage: next.stage,
        last_rating: event.rating,
        last_reviewed_at: now.toISOString(),
        next_due_at: next.next_due_at.toISOString(),
        version: (old?.version ?? 0) + 1,
      };
      await tx.reviewState.upsert({
        where: { userId_cardId: { userId, cardId: card.id } },
        create: {
          userId,
          cardId: card.id,
          stage: next.stage,
          lastRating: event.rating,
          reviewedAt: now,
          dueAt: next.next_due_at,
          version: 1,
        },
        update: {
          stage: next.stage,
          lastRating: event.rating,
          reviewedAt: now,
          dueAt: next.next_due_at,
          version: state.version,
        },
      });
      await tx.allocation.upsert({
        where: { userId_cardId: { userId, cardId: card.id } },
        create: { userId, cardId: card.id, day: dayInTokyo(now) },
        update: {},
      });
      await tx.reviewEvent.create({
        data: {
          id: event.event_id,
          userId,
          cardId: card.id,
          rating: event.rating,
          answeredAt: new Date(event.answered_at),
          receivedAt: now,
          deviceId: event.device_id,
          algorithmVersion: 1,
          payloadHash: hash,
          result: asJson(state),
        },
      });
      return { event_id: event.event_id, status: 'accepted', state };
    },
    { timeout: 30000, maxWait: 30000 },
  );
}
export async function home(now = new Date()) {
  const day = dayInTokyo(now);
  const since = new Date(day + 'T00:00:00+09:00');
  const until = new Date(since.getTime() + 86400000);
  const [due, used, user, completed, all, remaining, pendingCount] = await Promise.all([
    db.reviewState.count({ where: { userId, dueAt: { lte: now }, card: { active: true } } }),
    db.allocation.count({ where: { userId, day } }),
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.reviewEvent.count({ where: { userId, receivedAt: { gte: since, lt: until } } }),
    content(),
    db.card.count({ where: { active: true, allocations: { none: { userId } } } }),
    db.card.count({
      where: {
        active: true,
        allocations: { some: { userId } },
        states: { none: { userId, reviewedAt: { not: null } } },
      },
    }),
  ]);
  return {
    today: day,
    due_count: due,
    pending_count: pendingCount,
    new_available: Math.min(remaining, Math.max(0, user.limit - used)),
    completed_today: completed,
    recent_lessons: all.summaries.slice(0, 3),
    server_time: now.toISOString(),
  };
}
export async function stateFor(cardId: string) {
  const s = await db.reviewState.findUnique({ where: { userId_cardId: { userId, cardId } } });
  return s
    ? {
        card_id: s.cardId,
        stage: s.stage,
        last_rating: s.lastRating as Rating,
        last_reviewed_at: s.reviewedAt?.toISOString(),
        next_due_at: s.dueAt?.toISOString(),
        version: s.version,
      }
    : null;
}

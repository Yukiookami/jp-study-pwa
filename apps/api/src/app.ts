import { contentStatus, subscribeContent, closeContentStreams, runImport } from './content-sync.js';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import {
  SearchSchema,
  HistorySchema,
  ItemTypeSchema,
  QueueSchema,
  CancelQueueSchema,
  EventsSchema,
  SettingsSchema,
  matches,
} from '@jp-study/shared';
import { db, userId } from './db.js';
import { AppError, content, lessonDetail } from './content.js';
import { queue, cancelQueue, acceptEvent, home } from './review.js';
import { root } from './config.js';
export function buildApp(log = true) {
  const app = Fastify({ logger: log, bodyLimit: 524288 });
  app.addHook('onRequest', async (req) => {
    if (
      ['POST', 'PUT', 'DELETE'].includes(req.method) &&
      !(req.headers['content-type'] ?? '').startsWith('application/json')
    )
      throw new AppError(415, '请求必须使用 JSON 格式');
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError)
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_INPUT', message: '请求参数不正确', request_id: req.id } });
    const status =
      err instanceof AppError
        ? err.status
        : typeof err.statusCode === 'number'
          ? err.statusCode
          : 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({
      error: {
        code: err instanceof AppError ? err.code : 'REQUEST_FAILED',
        message:
          err instanceof AppError
            ? err.message
            : status < 500
              ? '请求参数不正确'
              : '服务暂时无法完成请求，请稍后重试',
        request_id: req.id,
      },
    });
  });
  app.get('/api/v1/health', async () => {
    await db.$queryRaw`SELECT 1`;
    return { data: { status: 'ok' } };
  });
  app.addHook('preClose', async () => {
    closeContentStreams();
  });
  app.get('/api/v1/content/status', async () => ({ data: contentStatus() }));
  app.get('/api/v1/content/events', async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, value: unknown) => {
      if (!reply.raw.destroyed)
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    const unsubscribe = subscribeContent(send, () => reply.raw.end());
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': keepalive\n\n');
    }, 25000);
    reply.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    send('ready', contentStatus());
  });
  app.get('/api/v1/home', async () => ({ data: await home() }));
  app.get('/api/v1/lessons', async (req) => {
    const s = SearchSchema.parse(req.query);
    const all = await content();
    const list = all.summaries.filter((l) => l.title.includes(s.q));
    return {
      data: list.slice((s.page - 1) * s.page_size, s.page * s.page_size),
      meta: { page: s.page, page_size: s.page_size, total: list.length },
    };
  });
  app.get<{ Params: { id: string } }>('/api/v1/lessons/:id', async (req) => ({
    data: await lessonDetail(req.params.id),
  }));
  app.post('/api/v1/lessons/import', async () => ({ data: await runImport() }));
  app.get('/api/v1/items', async (req) => {
    const s = SearchSchema.parse(req.query);
    const all = await content();
    const items = all.items.filter(
      (i) =>
        (!s.type || i.item_type === s.type) &&
        (!s.lesson_id || i.lesson_sources.some((l) => l.id === s.lesson_id)) &&
        (!s.tag || i.tags.includes(s.tag)) &&
        (s.favorite !== 'true' || i.favorited) &&
        matches(i, s.q),
    );
    return {
      data: items.slice((s.page - 1) * s.page_size, s.page * s.page_size),
      meta: {
        page: s.page,
        page_size: s.page_size,
        total: items.length,
        available_tags: [...new Set(all.items.flatMap((i) => i.tags))].sort(),
      },
    };
  });
  app.get<{ Params: { type: string; id: string } }>('/api/v1/items/:type/:id', async (req) => {
    const type = ItemTypeSchema.parse(req.params.type);
    const item = (await content()).items.find(
      (i) => i.id === req.params.id && i.item_type === type,
    );
    if (!item) throw new AppError(404, '没有找到这个条目');
    const cards = await db.card.findMany({
      where: { itemType: type, itemId: item.id, active: true },
      include: { states: { where: { userId } } },
    });
    const progress = cards.map((c) => ({
      card_id: c.id,
      card_type: c.cardType,
      state: c.states[0]
        ? {
            card_id: c.id,
            stage: c.states[0].stage,
            last_rating: c.states[0].lastRating,
            last_reviewed_at: c.states[0].reviewedAt?.toISOString(),
            next_due_at: c.states[0].dueAt?.toISOString(),
            version: c.states[0].version,
          }
        : null,
    }));
    return { data: { ...item, progress } };
  });
  for (const method of ['PUT', 'DELETE'] as const)
    app.route<{ Params: { type: string; id: string } }>({
      method,
      url: '/api/v1/favorites/:type/:id',
      handler: async (req) => {
        const type = ItemTypeSchema.parse(req.params.type);
        const id = req.params.id;
        const exists = (await content()).items.some((i) => i.id === id && i.item_type === type);
        if (!exists) throw new AppError(404, '没有找到这个条目');
        if (method === 'PUT')
          await db.favorite.upsert({
            where: { userId_itemType_itemId: { userId, itemType: type, itemId: id } },
            create: {
              userId,
              itemType: type,
              itemId: id,
              ...(type === 'expression' ? { expressionId: id } : { vocabularyId: id }),
            },
            update: {},
          });
        else await db.favorite.deleteMany({ where: { userId, itemType: type, itemId: id } });
        return { data: { favorited: method === 'PUT' } };
      },
    });
  app.post('/api/v1/review/cancel', async (req) => ({
    data: await cancelQueue(CancelQueueSchema.parse(req.body).card_ids),
  }));
  app.post('/api/v1/review/queue', async (req) => ({
    data: await queue(QueueSchema.parse(req.body)),
  }));
  app.post('/api/v1/review/events', async (req) => {
    const { events } = EventsSchema.parse(req.body);
    const results = [];
    for (const e of [...events].sort((a, b) => a.answered_at.localeCompare(b.answered_at))) {
      try {
        results.push(await acceptEvent(e));
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        results.push({ event_id: e.event_id, status: 'rejected', error: error.message });
      }
    }
    return { data: { results, server_time: new Date().toISOString() } };
  });
  app.get('/api/v1/review/history', async (req) => {
    const s = HistorySchema.parse(req.query);
    const events = await db.reviewEvent.findMany({
      where: { userId, ...(s.card_id ? { cardId: s.card_id } : {}) },
      orderBy: { sequence: 'desc' },
      skip: (s.page - 1) * s.page_size,
      take: s.page_size,
    });
    return {
      data: events.map((e) => ({
        event_id: e.id,
        card_id: e.cardId,
        rating: e.rating,
        answered_at: e.answeredAt.toISOString(),
        received_at: e.receivedAt.toISOString(),
        sequence: e.sequence.toString(),
      })),
    };
  });
  app.get('/api/v1/settings', async () => ({
    data: {
      daily_new_limit: (await db.user.findUniqueOrThrow({ where: { id: userId } })).limit,
      timezone: 'Asia/Tokyo',
    },
  }));
  app.put('/api/v1/settings', async (req) => {
    const input = SettingsSchema.parse(req.body);
    await db.user.update({ where: { id: userId }, data: { limit: input.daily_new_limit } });
    return { data: { ...input, timezone: 'Asia/Tokyo' } };
  });
  const web = resolve(root, 'apps/web/dist');
  if (existsSync(web)) {
    app.register(fastifyStatic, {
      root: web,
      prefix: '/',
      setHeaders: (res, path) => {
        if (path.endsWith('sw.js') || path.endsWith('index.html'))
          res.setHeader('Cache-Control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/')
        ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}

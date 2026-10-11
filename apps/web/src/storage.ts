import { newEventId } from './uuid';
import { openDB } from 'idb';
import type { ReviewInput, Queue, LessonDetail, EventResult, Item } from '@jp-study/shared';
// IndexedDB cannot clone Vue reactive proxies. Persist plain DTO values.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const localDB = openDB('jp-study', 1, {
  upgrade(db) {
    db.createObjectStore('cache');
    db.createObjectStore('outbox', { keyPath: 'event_id' });
    db.createObjectStore('lessons', { keyPath: 'lesson.id' });
    db.createObjectStore('session');
  },
});
export async function cache<T>(key: string, value?: T): Promise<T | undefined> {
  const db = await localDB;
  if (value !== undefined) {
    await db.put('cache', plain(value), key);
    return value;
  }
  return db.get('cache', key);
}
export async function downloaded() {
  return (await localDB).getAll('lessons') as Promise<LessonDetail[]>;
}
export async function saveLesson(lesson: LessonDetail) {
  await (await localDB).put('lessons', plain(lesson));
}
export async function removeLesson(id: string) {
  const db = await localDB;
  await db.delete('lessons', id);
  await db.delete('cache', '/lessons/' + id);
}
export async function cachedItems(): Promise<Item[]> {
  const lessons = await downloaded();
  const items = new Map<string, Item>();
  for (const l of lessons)
    for (const i of [...l.expressions, ...l.vocabulary]) {
      const old = items.get(i.id);
      items.set(
        i.id,
        old
          ? {
              ...old,
              lesson_sources: [
                ...new Map(
                  [...old.lesson_sources, ...i.lesson_sources].map((l) => [l.id, l]),
                ).values(),
              ],
            }
          : i,
      );
    }
  return [...items.values()];
}
export async function session(value?: Queue) {
  const db = await localDB;
  if (value) await db.put('session', plain(value), 'current');
  return db.get('session', 'current') as Promise<Queue | undefined>;
}
export async function recordAnswer(event: ReviewInput, remaining: Queue) {
  const db = await localDB;
  const tx = db.transaction(['outbox', 'session'], 'readwrite');
  await tx.objectStore('outbox').put(plain(event));
  await tx.objectStore('session').put(plain(remaining), 'current');
  await tx.done;
}
export async function pending() {
  const events: ReviewInput[] = await (await localDB).getAll('outbox');
  return events.sort((a, b) => a.answered_at.localeCompare(b.answered_at));
}
export async function acknowledge(results: EventResult[]) {
  const db = await localDB;
  const tx = db.transaction('outbox', 'readwrite');
  for (const r of results)
    if (r.status === 'accepted' || r.status === 'duplicate') await tx.store.delete(r.event_id);
  await tx.done;
}
export async function deviceId() {
  let id = await cache<string>('device');
  if (!id) {
    id = newEventId();
    await cache('device', id);
  }
  return id;
}

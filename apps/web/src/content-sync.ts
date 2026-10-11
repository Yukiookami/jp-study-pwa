import type { ContentStatus, LessonDetail, LessonSummary } from '@jp-study/shared';
import { http } from './api';
import { downloaded, saveLesson, cache, localDB } from './storage';
export async function refreshDownloaded(
  fetchDetail = (id: string) =>
    http.get<{ data: LessonDetail }>('/lessons/' + id).then((r) => r.data.data),
) {
  const before = await downloaded();
  if (!before.length) return [];
  const catalog: LessonSummary[] = [];
  let page = 1,
    total = 0;
  do {
    const { data } = await http.get('/lessons', { params: { page, page_size: 100 } });
    catalog.push(...data.data);
    total = data.meta.total;
    page++;
  } while (catalog.length < total);
  const updated: string[] = [];
  for (const local of before) {
    const latest = catalog.find((l) => l.id === local.lesson.id);
    if (!latest || latest.content_version === local.content_version) continue;
    const fresh = await fetchDetail(local.lesson.id);
    // A user may have removed this download while the request was in flight.
    if (!(await (await localDB).get('lessons', local.lesson.id))) continue;
    await saveLesson(fresh);
    await cache('/lessons/' + local.lesson.id, fresh);
    updated.push(local.lesson.id);
  }
  return updated;
}
export function connectContent(options: {
  onChange: () => Promise<void>;
  onStatus: (value: ContentStatus) => void;
  onError: (message: string) => void;
}) {
  let source: EventSource | undefined,
    closed = false,
    running: Promise<void> | undefined,
    again = false,
    lastRevision = '';
  async function refresh() {
    if (closed || !navigator.onLine || document.visibilityState === 'hidden') return;
    if (running) {
      again = true;
      return running;
    }
    running = options
      .onChange()
      .catch(() => options.onError('内容更新暂未完成；已有下载保留，恢复连接后会重试。'));
    await running;
    running = undefined;
    if (again && !closed) {
      again = false;
      void refresh();
    }
  }
  function start() {
    if (closed || !navigator.onLine || document.visibilityState === 'hidden' || source) return;
    source = new EventSource('/api/v1/content/events');
    for (const event of ['ready', 'content', 'status'])
      source.addEventListener(event, (message) => {
        try {
          const value = JSON.parse((message as MessageEvent).data) as ContentStatus;
          options.onStatus(value);
          if (event === 'ready' || (event === 'content' && lastRevision !== value.revision)) {
            lastRevision = value.revision;
            void refresh();
          }
        } catch {
          /* ignore invalid transport messages */
        }
      });
  }
  function pause() {
    source?.close();
    source = undefined;
  }
  function online() {
    start();
    void refresh();
  }
  function visibility() {
    if (document.visibilityState === 'hidden') pause();
    else online();
  }
  window.addEventListener('online', online);
  window.addEventListener('offline', pause);
  document.addEventListener('visibilitychange', visibility);
  start();
  return {
    refresh,
    stop() {
      closed = true;
      pause();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', pause);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}

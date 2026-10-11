import { randomUUID } from 'node:crypto';
import type { ContentStatus } from '@jp-study/shared';
import { importLessons } from './content.js';
import { lessonsRoot } from './config.js';
const status: ContentStatus = {
  revision: randomUUID(),
  watching: false,
  last_checked_at: null,
  last_imported_at: null,
  error_count: 0,
  message: '等待检查学习内容',
};
const subscribers = new Set<(event: 'content' | 'status', value: ContentStatus) => void>();
const streams = new Set<() => void>();
let tail: Promise<unknown> = Promise.resolve();
export function contentStatus() {
  return { ...status };
}
function publish(event: 'content' | 'status') {
  for (const listener of subscribers) listener(event, contentStatus());
}
export function subscribeContent(
  listener: (event: 'content' | 'status', value: ContentStatus) => void,
  close: () => void,
) {
  subscribers.add(listener);
  streams.add(close);
  return () => {
    subscribers.delete(listener);
    streams.delete(close);
  };
}
export function closeContentStreams() {
  for (const close of [...streams]) close();
}
export function watcherState(watching: boolean, message?: string) {
  status.watching = watching;
  if (message) {
    status.message = message;
    status.error_count = Math.max(1, status.error_count);
  }
  publish('status');
}
export function runImport(directory = lessonsRoot) {
  const next = tail.then(async () => {
    try {
      const report = await importLessons(directory);
      status.last_checked_at = new Date().toISOString();
      status.error_count = report.failed;
      status.message = report.failed
        ? `${report.failed} 份学习内容未导入，已有内容保留；请检查源文件。`
        : report.succeeded
          ? '学习内容已自动更新'
          : '学习内容已是最新';
      if (report.succeeded) {
        status.last_imported_at = status.last_checked_at;
        status.revision = randomUUID();
        publish('content');
      }
      publish('status');
      return report;
    } catch (error) {
      status.last_checked_at = new Date().toISOString();
      status.error_count = 1;
      status.message = '学习内容暂时无法导入，已有内容保留。';
      publish('status');
      throw error;
    }
  });
  tail = next.catch(() => {});
  return next;
}

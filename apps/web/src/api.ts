import axios from 'axios';
import { cache, acknowledge, pending } from './storage';
import type { EventResult } from '@jp-study/shared';
export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
});
export function message(e: unknown) {
  return axios.isAxiosError(e)
    ? (e.response?.data?.error?.message ?? '无法连接 Mac，请检查网络；已下载的内容仍可查看。')
    : e instanceof Error
      ? e.message
      : '操作未完成，请重试。';
}
export async function get<T>(url: string): Promise<T> {
  try {
    const { data } = await http.get<{ data: T }>(url);
    await cache(url, data.data);
    return data.data;
  } catch (e) {
    const old = await cache<T>(url);
    if (old !== undefined) return old;
    throw e;
  }
}
let syncing: Promise<string[]> | undefined;
export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    let events = await pending();
    const errors: string[] = [];
    while (events.length) {
      for (let i = 0; i < events.length; i += 100) {
        const { data } = await http.post<{ data: { results: EventResult[] } }>('/review/events', {
          events: events.slice(i, i + 100),
        });
        await acknowledge(data.data.results);
        errors.push(
          ...data.data.results
            .filter((r) => r.status === 'rejected')
            .map((r) => r.error ?? '记录需要处理'),
        );
      }
      if (errors.length) break;
      events = await pending();
    }
    return errors;
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}

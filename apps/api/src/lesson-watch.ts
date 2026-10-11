import { watch, type FSWatcher } from 'node:fs';
import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
type Options = {
  quietMs?: number;
  stabilityMs?: number;
  onError?: (message: string, active: boolean) => void;
};
// Directory events wake this watcher; timers are only for coalescing actual changes.
export async function watchLessons(
  directory: string,
  importContent: () => Promise<unknown>,
  options: Options = {},
) {
  const quietMs = options.quietMs ?? 500,
    stabilityMs = options.stabilityMs ?? 200;
  let watcher: FSWatcher | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    running: Promise<void> | undefined;
  let stopped = false,
    dirty = false;
  async function snapshot() {
    const base = await realpath(directory);
    const parts: string[] = [];
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      for (const name of ['lesson.json', 'memo.md']) {
        try {
          const file = await realpath(join(directory, entry.name, name));
          const rel = relative(base, file);
          if (rel.startsWith('..') || isAbsolute(rel)) continue;
          const info = await stat(file);
          parts.push(`${rel}:${info.size}:${info.mtimeMs}:${await readFile(file, 'utf8')}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    return parts.join('\n');
  }
  function request() {
    if (stopped) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), quietMs);
  }
  async function run() {
    timer = undefined;
    if (stopped) return;
    if (running) {
      dirty = true;
      return;
    }
    dirty = false;
    running = (async () => {
      try {
        const before = await snapshot();
        await new Promise((r) => setTimeout(r, stabilityMs));
        if (stopped) return;
        if (before !== (await snapshot())) {
          request();
          return;
        }
        await importContent();
      } catch {
        options.onError?.('学习内容暂时无法读取；已有内容保留。', !!watcher);
      }
    })();
    await running;
    running = undefined;
    if (dirty && !stopped && !timer) request();
  }
  try {
    await realpath(directory);
    watcher = watch(directory, { recursive: true }, (_event, filename) => {
      const name = filename?.toString();
      if (!name) {
        request();
        return;
      }
      const normalized = name.replaceAll('\\', '/');
      const leaf = normalized.split('/').at(-1);
      if (leaf === 'lesson.json' || leaf === 'memo.md' || !normalized.includes('/')) request();
    });
    watcher.on('error', () => {
      watcher?.close();
      watcher = undefined;
      options.onError?.('自动监听已停止；可手动更新课程或重启服务。', false);
    });
  } catch {
    options.onError?.('自动监听无法启动；可手动更新课程。', false);
  }
  return {
    request,
    get active() {
      return !!watcher && !stopped;
    },
    async stop() {
      stopped = true;
      dirty = false;
      clearTimeout(timer);
      watcher?.close();
      watcher = undefined;
      await running;
    },
  };
}

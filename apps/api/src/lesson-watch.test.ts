import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { watchLessons } from './lesson-watch';
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('没有收到文件事件');
}
it('真实文件事件合并保存、支持新增目录/原子替换、空闲不轮询，关闭后不再导入', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jp-watch-'));
  const errors: string[] = [];
  let imports = 0;
  const watch = await watchLessons(
    directory,
    async () => {
      imports++;
    },
    { quietMs: 100, stabilityMs: 50, onError: (m) => errors.push(m) },
  );
  try {
    expect(watch.active).toBe(true);
    const folder = join(directory, 'life');
    await mkdir(folder);
    await writeFile(join(folder, 'lesson.json'), '{');
    await writeFile(join(folder, 'lesson.json'), '{}');
    await writeFile(join(folder, 'memo.md'), '生活摘录');
    await until(() => imports === 1);
    await new Promise((r) => setTimeout(r, 250));
    expect(imports).toBe(1);
    await writeFile(join(folder, '.replacement'), 'updated');
    await rename(join(folder, '.replacement'), join(folder, 'lesson.json'));
    await until(() => imports === 2);
    await watch.stop();
    await writeFile(join(folder, 'lesson.json'), 'after stop');
    await new Promise((r) => setTimeout(r, 200));
    expect(imports).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    await watch.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
it('目录不可用时提供明确状态并保留手动流程', async () => {
  const messages: string[] = [];
  const watcher = await watchLessons(join(tmpdir(), 'missing-' + Date.now()), async () => {}, {
    onError: (m) => messages.push(m),
  });
  expect(watcher.active).toBe(false);
  expect(messages).toHaveLength(1);
  await watcher.stop();
});

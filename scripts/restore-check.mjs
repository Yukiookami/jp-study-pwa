import { spawnSync } from 'node:child_process';
import { openSync, closeSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
process.loadEnvFile('.env');
const file = resolve(process.argv[2] ?? '');
if (!existsSync(file) || !file.endsWith('.dump'))
  throw new Error('请提供备份目录中的 database.dump');
const name = 'jp_study_restore_' + Date.now();
const user = process.env.POSTGRES_USER;
const run = (args, options = {}) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', ...args], {
    stdio: 'inherit',
    ...options,
  });
  if (r.status !== 0) throw new Error('恢复检查未完成；独立数据库名称：' + name);
  return r;
};
run(['createdb', '-U', user, name]);
try {
  const fd = openSync(file, 'r');
  try {
    run(
      ['pg_restore', '-U', user, '-d', name, '--no-owner', '--no-privileges', '--exit-on-error'],
      { stdio: [fd, 'inherit', 'inherit'] },
    );
  } finally {
    closeSync(fd);
  }
  run([
    'psql',
    '-U',
    user,
    '-d',
    name,
    '-c',
    'SELECT (SELECT count(*) FROM "Lesson") AS lessons, (SELECT count(*) FROM "Expression") AS expressions, (SELECT count(*) FROM "Vocabulary") AS vocabulary, (SELECT count(*) FROM "ReviewEvent") AS events;',
  ]);
  console.log('备份可在独立数据库完整恢复。当前学习库未改动。');
} finally {
  run(['dropdb', '-U', user, name]);
}

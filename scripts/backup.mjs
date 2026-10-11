import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, cpSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
process.loadEnvFile('.env');
const folder = resolve('backups', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(folder, { recursive: true });
const fd = openSync(resolve(folder, 'database.dump'), 'wx', 0o600);
const dump = spawnSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '-U',
    process.env.POSTGRES_USER,
    '-d',
    process.env.POSTGRES_DB,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
  ],
  { stdio: ['ignore', fd, 'inherit'] },
);
closeSync(fd);
if (dump.status !== 0) throw new Error('备份失败，请检查数据库状态');
cpSync('lessons', resolve(folder, 'lessons'), { recursive: true });
writeFileSync(
  resolve(folder, 'README.txt'),
  '数据库与课程源备份。凭据不包含在备份中。请将整个目录保存到安全位置。\n',
);
console.log('备份已保存：' + folder);

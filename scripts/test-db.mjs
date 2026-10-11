import { spawnSync } from 'node:child_process';
process.loadEnvFile('.env');
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const exists = spawnSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    process.env.POSTGRES_USER,
    '-d',
    'postgres',
    '-tAc',
    "SELECT 1 FROM pg_database WHERE datname='jp_study_test'",
  ],
  { encoding: 'utf8' },
);
if (exists.status !== 0) throw new Error('请先启动 Docker 数据库');
if (exists.stdout.trim() !== '1')
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'createdb',
    '-U',
    process.env.POSTGRES_USER,
    'jp_study_test',
  ]);
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/jp_study_test';
const env = { ...process.env, DATABASE_URL: url.toString(), RUN_DATABASE_TESTS: '1' };
run('pnpm', ['--filter', '@jp-study/api', 'exec', 'prisma', 'migrate', 'deploy'], { env });
run('pnpm', ['exec', 'vitest', 'run', 'apps/api/src/integration.test.ts'], { env });

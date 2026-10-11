import './config.js';
import { spawnSync } from 'node:child_process';
const mode = process.argv[2] === 'dev' ? 'dev' : 'deploy';
const result = spawnSync(
  'pnpm',
  ['exec', 'prisma', 'migrate', mode, ...(mode === 'dev' ? ['--name', 'update'] : [])],
  { stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);

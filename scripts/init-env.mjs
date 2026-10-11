import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) {
  console.log('已有 .env，保留原配置。');
} else {
  let apiHost = '127.0.0.1';
  try {
    const result = spawnSync(
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
      ['status', '--json'],
      { encoding: 'utf8', timeout: 5000 },
    );
    if (result.status === 0) {
      const value = JSON.parse(result.stdout).Self?.TailscaleIPs?.find((ip) =>
        /^100\.\d+\.\d+\.\d+$/.test(ip),
      );
      if (value) apiHost = value;
    }
  } catch {
    /* New environments may not have Tailscale yet. */
  }
  const password = randomBytes(24).toString('hex');
  writeFileSync(
    '.env',
    `POSTGRES_DB=jp_study\nPOSTGRES_USER=jp_study\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_PORT=5433\nDATABASE_URL=postgresql://jp_study:${password}@127.0.0.1:5433/jp_study\nAPI_HOST=${apiHost}\nAPI_PORT=3001\nLESSONS_ROOT=./lessons\nAPP_TIMEZONE=Asia/Tokyo\n`,
    { mode: 0o600 },
  );
  console.log('已生成本机配置。');
}

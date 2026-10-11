import { config } from './config.js';
import { ensureUser, db } from './db.js';
import { importLessons } from './content.js';
import { buildApp } from './app.js';
await ensureUser();
const app = buildApp();
try {
  const report = await importLessons();
  app.log.info(
    { succeeded: report.succeeded, unchanged: report.unchanged, failed: report.failed },
    '课程导入检查完成',
  );
} catch {
  app.log.warn('课程目录不可读；已有内容仍可使用');
}
await app.listen({ host: config.API_HOST, port: config.API_PORT });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void app
      .close()
      .then(() => db.$disconnect())
      .then(() => process.exit(0));
  });

import { config } from './config.js';
import { ensureUser, db } from './db.js';
import { runImport, watcherState } from './content-sync.js';
import { watchLessons } from './lesson-watch.js';
import { lessonsRoot } from './config.js';
import { buildApp } from './app.js';
await ensureUser();
const app = buildApp();
const watcher = await watchLessons(lessonsRoot, () => runImport(), {
  onError: (message, active) => {
    watcherState(active, message);
    app.log.warn(message);
  },
});
if (watcher.active) watcherState(true);
app.addHook('preClose', async () => {
  await watcher.stop();
});
try {
  const report = await runImport();
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

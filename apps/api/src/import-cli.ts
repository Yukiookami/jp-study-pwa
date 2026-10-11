import { db, ensureUser } from './db.js';
import { importLessons } from './content.js';
try {
  await ensureUser();
  const report = await importLessons();
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
} finally {
  await db.$disconnect();
}

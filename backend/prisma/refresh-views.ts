/**
 * Обновление materialized views аналитики.
 *
 * Вызывается после успешного sync_run из SyncService и доступен как
 * `npm run db:refresh-views` для запуска по расписанию (cron/systemd timer).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const startedAt = Date.now();
  await prisma.$executeRawUnsafe('SELECT refresh_analytics_views(true)');
  console.log(`[refresh-views] готово за ${Date.now() - startedAt} мс`);
}

main()
  .catch((error) => {
    console.error('[refresh-views] ошибка:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Пароли и токены в query-логи не попадают: уровень query включается
      // только вручную при отладке.
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Подключение к PostgreSQL установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Обновление materialized views аналитики (см. ADR 0006). */
  async refreshAnalyticsViews(concurrently = true): Promise<void> {
    await this.$executeRawUnsafe('SELECT refresh_analytics_views($1)', concurrently);
  }
}

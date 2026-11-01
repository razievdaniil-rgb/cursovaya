import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** Derived caches can always be rebuilt from normalized source relations. */
@Injectable()
export class AnalyticsMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsMaintenanceService.name);
  private timer?: ReturnType<typeof setInterval>;
  private refreshing = false;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    const minutes = this.config.get<number>('ANALYTICS_REFRESH_INTERVAL_MINUTES') ?? 15;
    if (!minutes) return;
    this.timer = setInterval(() => void this.refresh(), minutes * 60_000);
    this.timer.unref();
  }

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.prisma.refreshAnalyticsViews(true);
    } catch {
      this.logger.error('Не удалось обновить аналитические представления; следующая попытка по расписанию');
    } finally {
      this.refreshing = false;
    }
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}

import { Module } from '@nestjs/common';

import { SyncModule } from '../sync/sync.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsMaintenanceService } from './analytics-maintenance.service';
import { GovernmentController } from './government.controller';

@Module({
  imports: [SyncModule],
  controllers: [GovernmentController],
  providers: [AnalyticsService, AnalyticsMaintenanceService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

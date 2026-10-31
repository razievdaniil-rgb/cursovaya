import { Module } from '@nestjs/common';

import { SyncModule } from '../sync/sync.module';
import { AnalyticsService } from './analytics.service';
import { GovernmentController } from './government.controller';

@Module({
  imports: [SyncModule],
  controllers: [GovernmentController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

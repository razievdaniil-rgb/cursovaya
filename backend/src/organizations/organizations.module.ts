import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [NotificationsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationMembershipGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

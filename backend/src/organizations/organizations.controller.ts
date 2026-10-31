import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedRequest, RequestUser } from '../auth/jwt-auth.guard';
import { Problems } from '../common/problem';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  notificationIdSchema,
  notificationsQuerySchema,
  type NotificationsQueryInput,
} from '../notifications/notifications.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationMembershipGuard } from './organization-membership.guard';
import { OrganizationsService } from './organizations.service';

/**
 * Кабинет медорганизации.
 *
 * OrganizationMembershipGuard проверяет членство на каждом запросе и кладёт
 * в запрос organizationId. Роль `admin` эту проверку не обходит.
 */
@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(OrganizationMembershipGuard)
@Controller('organization')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Сводка кабинета',
    description:
      'Счётчики читаются из organization_dashboard_view. Если пользователь ' +
      'состоит в нескольких организациях, укажите ?organizationId=.',
  })
  async dashboard(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizations.getDashboard(this.resolve(request), user.id);
  }

  @Get('members')
  @ApiOperation({ summary: 'Сотрудники организации' })
  async members(@Req() request: AuthenticatedRequest) {
    return this.organizations.getMembers(this.resolve(request));
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Уведомления сотрудника организации',
    description:
      'Уведомления адресуются пользователю, поэтому список совпадает с ' +
      '/me/notifications; эндпоинт дополнительно требует членства в организации.',
  })
  async notificationList(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(notificationsQuerySchema))
    query: NotificationsQueryInput,
  ) {
    return this.notifications.findForUser(user.id, query);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  async markRead(
    @Param(new ZodValidationPipe(notificationIdSchema)) params: { id: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.notifications.markRead(params.id, user.id);
  }

  private resolve(request: AuthenticatedRequest): string {
    const organizationId = request.organizationId;
    // Guard обязан был его установить; проверка защищает от случайного
    // отключения guard при рефакторинге.
    if (!organizationId) throw Problems.notOrganizationMember();
    return organizationId;
  }
}

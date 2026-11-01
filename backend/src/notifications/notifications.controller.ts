import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt-auth.guard';
import { ApiProblemResponse, ApiZodQuery } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  notificationIdSchema,
  notificationsQuerySchema,
  type NotificationsQueryInput,
} from './notifications.schema';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiZodQuery(notificationsQuerySchema)
  @ApiProblemResponse(401, 'Требуется авторизация')
  @ApiOperation({
    summary: 'Мои уведомления',
    description: 'meta.unreadCount всегда считает все непрочитанные, а не только на странице.',
  })
  async list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(notificationsQuerySchema))
    query: NotificationsQueryInput,
  ) {
    return this.notifications.findForUser(user.id, query);
  }

  @Patch(':id/read')
  @ApiProblemResponse(404, 'Уведомление не найдено')
  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  async markRead(
    @Param(new ZodValidationPipe(notificationIdSchema)) params: { id: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.notifications.markRead(params.id, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Отметить все уведомления прочитанными' })
  async markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.id);
  }
}

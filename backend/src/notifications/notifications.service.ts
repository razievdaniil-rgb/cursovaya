import { Injectable } from '@nestjs/common';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationsQueryInput } from './notifications.schema';

/**
 * Уведомления пользователя.
 *
 * Уведомление и факт его доставки разделены: `notifications` хранит само
 * сообщение, `notification_recipients` — кому оно адресовано и прочитано ли.
 * Одно уведомление может быть прочитано одним адресатом и не прочитано
 * другим, поэтому read_at лежит в таблице связи, а не в уведомлении.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string, query: NotificationsQueryInput) {
    const where = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const offset = (query.page - 1) * query.limit;

    const [recipients, total, unread] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        orderBy: { notification: { createdAt: 'desc' } },
        skip: offset,
        take: query.limit,
        select: {
          deliveredAt: true,
          readAt: true,
          notification: {
            select: {
              id: true,
              title: true,
              body: true,
              createdAt: true,
              notificationType: { select: { code: true, name: true } },
              severity: { select: { code: true, name: true } },
              product: { select: { id: true, name: true, shortName: true } },
            },
          },
        },
      }),
      this.prisma.notificationRecipient.count({ where }),
      this.prisma.notificationRecipient.count({ where: { userId, readAt: null } }),
    ]);

    return {
      data: recipients.map((recipient) => ({
        id: recipient.notification.id,
        title: recipient.notification.title,
        body: recipient.notification.body,
        createdAt: recipient.notification.createdAt,
        type: recipient.notification.notificationType,
        severity: recipient.notification.severity.code,
        severityName: recipient.notification.severity.name,
        product: recipient.notification.product,
        deliveredAt: recipient.deliveredAt,
        readAt: recipient.readAt,
        read: recipient.readAt !== null,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        unreadCount: unread,
      },
    };
  }

  async markRead(notificationId: string, userId: string) {
    const recipient = await this.prisma.notificationRecipient.findUnique({
      where: { notificationId_userId: { notificationId, userId } },
      select: { readAt: true },
    });

    // Чужое уведомление неотличимо от несуществующего.
    if (!recipient) throw Problems.notFound('Уведомление');

    // Повторная отметка не сдвигает дату первого прочтения.
    if (recipient.readAt === null) {
      await this.prisma.notificationRecipient.update({
        where: { notificationId_userId: { notificationId, userId } },
        data: { readAt: new Date() },
      });
    }

    const unreadCount = await this.prisma.notificationRecipient.count({
      where: { userId, readAt: null },
    });

    return { id: notificationId, read: true, unreadCount };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notificationRecipient.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { markedRead: result.count, unreadCount: 0 };
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notificationRecipient.count({
      where: { userId, readAt: null },
    });
  }
}

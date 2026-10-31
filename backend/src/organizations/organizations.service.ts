import { Injectable } from '@nestjs/common';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Кабинет медорганизации.
 *
 * Все счётчики берутся из organization_dashboard_view — представления поверх
 * нормализованных таблиц. В organizations нет ни одной производной колонки.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: string, userId: string) {
    const [summary] = await this.prisma.$queryRaw<
      {
        organization_id: string;
        organization_name: string;
        verification_status_code: string;
        saved_product_count: number;
        comparison_count: number;
        review_count: number;
        reviews_on_moderation_count: number;
        unread_notification_count: number;
        member_count: number;
      }[]
    >`
      SELECT organization_id, organization_name, verification_status_code,
             saved_product_count, comparison_count, review_count,
             reviews_on_moderation_count, unread_notification_count, member_count
        FROM organization_dashboard_view
       WHERE organization_id = ${organizationId}::uuid
    `;

    if (!summary) throw Problems.notFound('Организация');

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        shortName: true,
        inn: true,
        ogrn: true,
        address: true,
        organizationType: { select: { code: true, name: true } },
        verificationStatus: { select: { code: true, name: true } },
        city: {
          select: {
            name: true,
            region: { select: { name: true, country: { select: { name: true } } } },
          },
        },
      },
    });

    // Сохранённые изделия организации с актуальными карточками каталога.
    const savedProducts = await this.prisma.$queryRaw<
      {
        product_id: string;
        name: string;
        short_name: string;
        manufacturer_name: string;
        registry_status_code: string;
        price_min: number | null;
        price_max: number | null;
        average_rating: number | null;
        primary_image_storage_key: string | null;
      }[]
    >`
      SELECT DISTINCT
             v.product_id, v.name, v.short_name, v.manufacturer_name,
             v.registry_status_code,
             v.price_min::float8 AS price_min,
             v.price_max::float8 AS price_max,
             v.average_rating::float8 AS average_rating,
             v.primary_image_storage_key
        FROM saved_lists sl
        JOIN saved_list_items sli ON sli.saved_list_id = sl.id
        JOIN product_catalog_view v ON v.product_id = sli.product_id
       WHERE sl.organization_id = ${organizationId}::uuid
       ORDER BY v.name ASC
    `;

    const notifications = await this.prisma.notificationRecipient.findMany({
      where: { userId, readAt: null },
      orderBy: { notification: { createdAt: 'desc' } },
      take: 5,
      select: {
        readAt: true,
        notification: {
          select: {
            id: true,
            title: true,
            body: true,
            createdAt: true,
            severity: { select: { code: true } },
            notificationType: { select: { code: true } },
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        shortName: organization.shortName,
        inn: organization.inn,
        ogrn: organization.ogrn,
        address: organization.address,
        type: organization.organizationType,
        verificationStatus: organization.verificationStatus.code,
        verificationStatusName: organization.verificationStatus.name,
        // Бейдж вычисляется из статуса, а не хранится отдельным полем.
        verified: organization.verificationStatus.code === 'verified',
        city: organization.city?.name ?? null,
        region: organization.city?.region.name ?? null,
        country: organization.city?.region.country.name ?? null,
      },
      counters: {
        savedProducts: Number(summary.saved_product_count),
        comparisons: Number(summary.comparison_count),
        reviews: Number(summary.review_count),
        reviewsOnModeration: Number(summary.reviews_on_moderation_count),
        unreadNotifications: Number(summary.unread_notification_count),
        members: Number(summary.member_count),
      },
      savedProducts: savedProducts.map((row) => ({
        id: row.product_id,
        name: row.name,
        shortName: row.short_name,
        manufacturer: row.manufacturer_name,
        registryStatus: row.registry_status_code,
        price: { min: row.price_min, max: row.price_max, currency: 'RUB' },
        rating: row.average_rating,
        image: row.primary_image_storage_key,
      })),
      notifications: notifications.map((recipient) => ({
        id: recipient.notification.id,
        title: recipient.notification.title,
        body: recipient.notification.body,
        createdAt: recipient.notification.createdAt,
        severity: recipient.notification.severity.code,
        type: recipient.notification.notificationType.code,
        product: recipient.notification.product,
        read: recipient.readAt !== null,
      })),
    };
  }

  async getMembers(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { joinedAt: 'asc' },
      select: {
        joinedAt: true,
        verifiedAt: true,
        memberRole: { select: { code: true, name: true } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });

    return members.map((member) => ({
      user: member.user,
      role: member.memberRole,
      joinedAt: member.joinedAt,
      verifiedAt: member.verifiedAt,
      verified: member.verifiedAt !== null,
    }));
  }
}

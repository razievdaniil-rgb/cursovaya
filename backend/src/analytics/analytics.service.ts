import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsQueryInput } from './analytics.schema';

/**
 * Государственная аналитика.
 *
 * Показатели берутся из materialized views (доля отечественных изделий по
 * годам, зависимость категорий от импорта) и обычных представлений
 * (проблемные изделия). Базовые таблицы остаются нормализованными, а
 * производные значения нигде не хранятся колонками (ADR 0006).
 *
 * `refreshedAt` — время последнего обновления кэша: колонка `now()` внутри
 * materialized view вычисляется в транзакции REFRESH.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(query: AnalyticsQueryInput) {
    const [domesticShare, importDependency] = await Promise.all([
      this.prisma.$queryRaw<
        {
          period_year: number;
          total_products: number;
          domestic_products: number;
          unknown_origin_products: number;
          domestic_share_percent: number;
          refreshed_at: Date;
        }[]
      >`
        SELECT period_year, total_products, domestic_products,
               unknown_origin_products,
               domestic_share_percent::float8 AS domestic_share_percent,
               refreshed_at
          FROM domestic_share_by_period_view
         ORDER BY period_year ASC
      `,
      this.getImportDependency(query.categoryId),
    ]);

    const latest = domesticShare.at(-1);
    const previous = domesticShare.at(-2);

    // Сигналы — это проблемные изделия из представления, а не отдельный
    // счётчик: иначе значение разошлось бы с составом каталога.
    const [signals] = await this.prisma.$queryRaw<
      { total: bigint; critical: bigint }[]
    >`
      SELECT count(*) AS total,
             count(*) FILTER (
               WHERE registration_expired
                  OR status_blocking
                  OR critical_review_count > 0
             ) AS critical
        FROM problem_products_view
    `;

    const refreshedAt =
      latest?.refreshed_at ?? importDependency[0]?.refreshedAt ?? null;

    return {
      // Поле отражает, что аналитика читается из кэша и может отставать.
      refreshedAt,
      domesticShare: latest?.domestic_share_percent ?? 0,
      domesticDelta:
        latest && previous
          ? Number(
              (latest.domestic_share_percent - previous.domestic_share_percent).toFixed(2),
            )
          : 0,
      totalProducts: latest?.total_products ?? 0,
      domesticProducts: latest?.domestic_products ?? 0,
      // Доля считается по изделиям с известным происхождением. Записи
      // государственного реестра его не содержат (ADR 0010), поэтому их
      // количество показывается отдельно, а не растворяется в знаменателе.
      unknownOriginProducts: latest?.unknown_origin_products ?? 0,
      signals: Number(signals?.total ?? 0),
      criticalSignals: Number(signals?.critical ?? 0),
      importSubstitution: domesticShare
        .filter((row) =>
          query.period ? String(row.period_year) >= query.period : true,
        )
        .map((row) => ({
          year: String(row.period_year),
          value: row.domestic_share_percent,
          totalProducts: row.total_products,
          domesticProducts: row.domestic_products,
          unknownOriginProducts: row.unknown_origin_products,
        })),
      dependencies: importDependency,
    };
  }

  private async getImportDependency(categoryId?: string) {
    const filter = categoryId
      ? Prisma.sql`WHERE category_id = ${categoryId}::uuid`
      : Prisma.sql`WHERE total_products > 0`;

    const rows = await this.prisma.$queryRaw<
      {
        category_id: string;
        category_name: string;
        category_slug: string;
        total_products: number;
        imported_products: number;
        domestic_products: number;
        unknown_origin_products: number;
        import_share_percent: number;
        refreshed_at: Date;
      }[]
    >`
      SELECT category_id, category_name, category_slug,
             total_products, imported_products, domestic_products,
             unknown_origin_products,
             import_share_percent::float8 AS import_share_percent,
             refreshed_at
        FROM category_import_dependency_view
        ${filter}
       ORDER BY import_share_percent DESC, category_name ASC
    `;

    return rows.map((row) => ({
      categoryId: row.category_id,
      category: row.category_name,
      categorySlug: row.category_slug,
      value: row.import_share_percent,
      totalProducts: row.total_products,
      importedProducts: row.imported_products,
      domesticProducts: row.domestic_products,
      unknownOriginProducts: row.unknown_origin_products,
      refreshedAt: row.refreshed_at,
    }));
  }

  async getProblemProducts(query = { page: 1, limit: 20 }) {
    const rows = await this.prisma.$queryRaw<
      {
        product_id: string;
        name: string;
        registration_number: string;
        registry_status_code: string;
        registration_expires_at: Date | null;
        registration_expired: boolean;
        registration_expiring: boolean;
        status_blocking: boolean;
        average_rating: number | null;
        critical_review_count: number;
        active_offer_count: number;
        without_active_offers: boolean;
      }[]
    >`
      SELECT product_id, name, registration_number, registry_status_code,
             registration_expires_at, registration_expired, registration_expiring,
             status_blocking, average_rating::float8 AS average_rating,
             critical_review_count, active_offer_count, without_active_offers
        FROM problem_products_view
       ORDER BY registration_expired DESC,
                status_blocking DESC,
                registration_expiring DESC,
                critical_review_count DESC,
                name ASC, product_id ASC
       LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `;

    const [count] = await this.prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM problem_products_view`;
    const total = Number(count?.total ?? 0);
    return { meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) }, data: rows.map((row) => ({
      id: row.product_id,
      name: row.name,
      registrationNumber: row.registration_number,
      registryStatus: row.registry_status_code,
      registrationExpiresAt: row.registration_expires_at,
      reasons: {
        registrationExpired: row.registration_expired,
        registrationExpiring: row.registration_expiring,
        statusBlocking: row.status_blocking,
        criticalReviews: row.critical_review_count > 0,
        withoutActiveOffers: row.without_active_offers,
      },
      averageRating: row.average_rating,
      criticalReviewCount: Number(row.critical_review_count),
      activeOfferCount: Number(row.active_offer_count),
    })) };
  }

  /** Принудительное обновление кэша аналитики. */
  async refresh() {
    await this.prisma.refreshAnalyticsViews(true);

    const [row] = await this.prisma.$queryRaw<{ refreshed_at: Date }[]>`
      SELECT refreshed_at FROM domestic_share_by_period_view LIMIT 1
    `;

    return { refreshedAt: row?.refreshed_at ?? null };
  }
}

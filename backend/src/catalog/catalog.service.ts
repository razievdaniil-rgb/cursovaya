import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Справочники для панели фильтров каталога.
 *
 * Счётчики считаются из нормализованных таблиц, а не хранятся рядом со
 * справочником: иначе они расходились бы с фактическим составом каталога
 * (в демо-данных такие числа были зашиты в `categories` вручную).
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [countries, categories, riskClasses, statuses, originTypes, manufacturers, price] =
      await Promise.all([
        this.prisma.$queryRaw<
          { id: string; iso2: string; name: string; product_count: number }[]
        >`
          SELECT c.id, c.iso2, c.name, count(p.id)::int AS product_count
            FROM countries c
            JOIN manufacturers m ON m.country_id = c.id
            JOIN products p ON p.manufacturer_id = m.id
           GROUP BY c.id, c.iso2, c.name
           ORDER BY count(p.id) DESC, c.name ASC
        `,

        this.prisma.$queryRaw<
          {
            id: string;
            name: string;
            slug: string;
            sort_order: number;
            product_count: number;
          }[]
        >`
          SELECT cat.id, cat.name, cat.slug, cat.sort_order, count(p.id)::int AS product_count
            FROM product_categories cat
            LEFT JOIN products p ON p.category_id = cat.id
           GROUP BY cat.id, cat.name, cat.slug, cat.sort_order
           ORDER BY cat.sort_order ASC, cat.name ASC
        `,

        this.prisma.$queryRaw<
          { id: string; code: string; name: string; sort_order: number; product_count: number }[]
        >`
          SELECT rc.id, rc.code, rc.name, rc.sort_order, count(p.id)::int AS product_count
            FROM risk_classes rc
            LEFT JOIN products p ON p.risk_class_id = rc.id
           GROUP BY rc.id, rc.code, rc.name, rc.sort_order
           ORDER BY rc.sort_order ASC
        `,

        this.prisma.$queryRaw<
          { id: string; code: string; name: string; product_count: number }[]
        >`
          SELECT rs.id, rs.code, rs.name, count(p.id)::int AS product_count
            FROM registry_statuses rs
            LEFT JOIN products p ON p.current_registry_status_id = rs.id
           GROUP BY rs.id, rs.code, rs.name
           ORDER BY rs.code ASC
        `,

        this.prisma.$queryRaw<
          { id: string; code: string; name: string; product_count: number }[]
        >`
          SELECT ot.id, ot.code, ot.name, count(p.id)::int AS product_count
            FROM product_origin_types ot
            LEFT JOIN products p ON p.origin_type_id = ot.id
           GROUP BY ot.id, ot.code, ot.name
           ORDER BY ot.code ASC
        `,

        // Страна присоединяется внешним JOIN: у производителей из
        // государственного реестра её нет (ADR 0010), а внутренний JOIN
        // выбросил бы их из фильтра целиком.
        this.prisma.$queryRaw<
          { id: string; name: string; country_name: string | null; product_count: number }[]
        >`
          SELECT m.id, m.name, c.name AS country_name, count(p.id)::int AS product_count
            FROM manufacturers m
            LEFT JOIN countries c ON c.id = m.country_id
            LEFT JOIN products p ON p.manufacturer_id = m.id
           GROUP BY m.id, m.name, c.name
          HAVING count(p.id) > 0
           ORDER BY count(p.id) DESC, m.name ASC
        `,

        // Границы диапазона — по действующим предложениям, как и в каталоге.
        this.prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
          SELECT min(price_min)::float8 AS min, max(price_max)::float8 AS max
            FROM product_price_range_view
           WHERE currency_code = 'RUB'
        `,
      ]);

    const totalProducts = await this.prisma.product.count();

    return {
      totalProducts,
      countries: countries.map((row) => ({
        id: row.id,
        iso2: row.iso2,
        name: row.name,
        productCount: Number(row.product_count),
      })),
      categories: categories.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        sortOrder: row.sort_order,
        productCount: Number(row.product_count),
      })),
      riskClasses: riskClasses.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        sortOrder: row.sort_order,
        productCount: Number(row.product_count),
      })),
      registryStatuses: statuses.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        productCount: Number(row.product_count),
      })),
      originTypes: originTypes.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        productCount: Number(row.product_count),
      })),
      manufacturers: manufacturers.map((row) => ({
        id: row.id,
        name: row.name,
        country: row.country_name,
        productCount: Number(row.product_count),
      })),
      price: {
        currency: 'RUB',
        min: price[0]?.min ?? null,
        max: price[0]?.max ?? null,
      },
      sortOptions: [
        { value: 'recommended', label: 'Сначала рекомендуемые' },
        { value: 'price-asc', label: 'Сначала дешевле' },
        { value: 'price-desc', label: 'Сначала дороже' },
        { value: 'rating-desc', label: 'По рейтингу' },
        { value: 'name-asc', label: 'По названию' },
        { value: 'newest', label: 'Сначала новые' },
      ],
    };
  }
}

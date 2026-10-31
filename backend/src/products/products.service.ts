import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogQueryInput, ProductReviewsQueryInput } from './products.schema';

/**
 * Каталог и карточка изделия.
 *
 * Список читается из product_catalog_view: представление уже соединяет
 * справочники и подтягивает рейтинг и диапазон действующих цен, так что
 * фильтры и сортировка применяются к одному набору колонок. Запрос собирается
 * через Prisma.sql — все значения уходят параметрами, конкатенации строк нет.
 *
 * Денежные значения и рейтинг приводятся к float8 только на выходе: в БД
 * остаются numeric(14,2) и numeric. Точности double достаточно для цен в
 * пределах миллионов рублей, а клиент получает число, а не строку.
 */

export interface CatalogRow {
  product_id: string;
  name: string;
  short_name: string;
  registration_number: string;
  registration_date: Date | null;
  registration_expires_at: Date | null;
  verified_at: Date | null;
  description: string | null;
  manufacturer_id: string;
  manufacturer_name: string;
  country_id: string;
  country_iso2: string;
  country_name: string;
  manufacturer_city_name: string | null;
  category_id: string;
  category_name: string;
  category_slug: string;
  risk_class_id: string;
  risk_class_code: string;
  origin_type_id: string;
  origin_type_code: string;
  registry_status_id: string;
  registry_status_code: string;
  registry_status_name: string;
  average_rating: number | null;
  review_count: number;
  organization_review_count: number;
  price_min: number | null;
  price_max: number | null;
  active_offer_count: number;
  primary_image_storage_key: string | null;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Список
  // -------------------------------------------------------------------------

  async findMany(query: CatalogQueryInput) {
    const where = this.buildWhere(query);
    const offset = (query.page - 1) * query.limit;

    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<CatalogRow[]>`
        SELECT
          v.product_id,
          v.name,
          v.short_name,
          v.registration_number,
          v.registration_date,
          v.registration_expires_at,
          v.verified_at,
          v.description,
          v.manufacturer_id,
          v.manufacturer_name,
          v.country_id,
          v.country_iso2,
          v.country_name,
          v.manufacturer_city_name,
          v.category_id,
          v.category_name,
          v.category_slug,
          v.risk_class_id,
          v.risk_class_code,
          v.origin_type_id,
          v.origin_type_code,
          v.registry_status_id,
          v.registry_status_code,
          v.registry_status_name,
          v.average_rating::float8 AS average_rating,
          v.review_count,
          v.organization_review_count,
          v.price_min::float8 AS price_min,
          v.price_max::float8 AS price_max,
          v.active_offer_count,
          v.primary_image_storage_key
        FROM product_catalog_view v
        LEFT JOIN product_search_documents sd ON sd.product_id = v.product_id
        ${where}
        ${this.buildOrderBy(query.sort)}
        LIMIT ${query.limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total
        FROM product_catalog_view v
        LEFT JOIN product_search_documents sd ON sd.product_id = v.product_id
        ${where}
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  private buildWhere(query: CatalogQueryInput): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];

    if (query.search) {
      // Полнотекстовый поиск по названию, производителю и описанию плюс
      // подстрочный по регистрационному номеру: «21851» внутри
      // «РЗН 2024/21851» tsvector не находит, а trigram-индекс находит.
      const term = query.search;
      conditions.push(Prisma.sql`(
        sd.search_vector @@ plainto_tsquery('russian', ${term})
        OR sd.search_vector @@ plainto_tsquery('simple', ${term})
        OR v.registration_number ILIKE ${'%' + term + '%'}
        OR v.manufacturer_name ILIKE ${'%' + term + '%'}
      )`);
    }

    if (query.categorySlug) {
      conditions.push(Prisma.sql`v.category_slug IN (${Prisma.join(query.categorySlug)})`);
    }
    if (query.categoryId) {
      conditions.push(
        Prisma.sql`v.category_id IN (${Prisma.join(query.categoryId.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    if (query.manufacturerId) {
      conditions.push(
        Prisma.sql`v.manufacturer_id IN (${Prisma.join(query.manufacturerId.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    if (query.countryIso2) {
      conditions.push(
        Prisma.sql`v.country_iso2 IN (${Prisma.join(query.countryIso2.map((code) => code.toUpperCase()))})`,
      );
    }
    if (query.status) {
      conditions.push(Prisma.sql`v.registry_status_code IN (${Prisma.join(query.status)})`);
    }
    if (query.riskClass) {
      conditions.push(Prisma.sql`v.risk_class_code IN (${Prisma.join(query.riskClass)})`);
    }
    if (query.originType) {
      conditions.push(Prisma.sql`v.origin_type_code IN (${Prisma.join(query.originType)})`);
    }

    // Фильтр по цене отсекает изделия без действующих предложений: цена
    // неизвестна, поэтому утверждать, что она попадает в диапазон, нельзя.
    if (query.priceMin !== undefined) {
      conditions.push(Prisma.sql`v.price_min >= ${query.priceMin}`);
    }
    if (query.priceMax !== undefined) {
      conditions.push(Prisma.sql`v.price_min <= ${query.priceMax}`);
    }

    if (conditions.length === 0) return Prisma.empty;

    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private buildOrderBy(sort: CatalogQueryInput['sort']): Prisma.Sql {
    switch (sort) {
      case 'price-asc':
        return Prisma.sql`ORDER BY v.price_min ASC NULLS LAST, v.name ASC`;
      case 'price-desc':
        return Prisma.sql`ORDER BY v.price_max DESC NULLS LAST, v.name ASC`;
      case 'rating-desc':
        return Prisma.sql`ORDER BY v.average_rating DESC NULLS LAST, v.review_count DESC, v.name ASC`;
      case 'name-asc':
        return Prisma.sql`ORDER BY v.name ASC`;
      case 'newest':
        return Prisma.sql`ORDER BY v.registration_date DESC NULLS LAST, v.name ASC`;
      case 'recommended':
      default:
        // «Рекомендуемые»: сначала действующая регистрация, затем рейтинг и
        // число отзывов. Детерминированный порядок важен для пагинации,
        // поэтому последним ключом идёт уникальный registration_number.
        return Prisma.sql`ORDER BY
          (v.registry_status_code = 'active') DESC,
          v.average_rating DESC NULLS LAST,
          v.review_count DESC,
          v.registration_number ASC`;
    }
  }

  private toListItem(row: CatalogRow) {
    return {
      id: row.product_id,
      name: row.name,
      shortName: row.short_name,
      registrationNumber: row.registration_number,
      registrationDate: row.registration_date,
      registrationExpiresAt: row.registration_expires_at,
      verifiedAt: row.verified_at,
      description: row.description,
      manufacturer: {
        id: row.manufacturer_id,
        name: row.manufacturer_name,
        city: row.manufacturer_city_name,
        country: {
          id: row.country_id,
          iso2: row.country_iso2,
          name: row.country_name,
        },
      },
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
      },
      riskClass: { id: row.risk_class_id, code: row.risk_class_code },
      originType: { id: row.origin_type_id, code: row.origin_type_code },
      registryStatus: {
        id: row.registry_status_id,
        code: row.registry_status_code,
        name: row.registry_status_name,
      },
      // Рейтинг и цены приходят из представлений, в products их нет.
      rating: {
        average: row.average_rating,
        reviewCount: Number(row.review_count),
        organizationReviewCount: Number(row.organization_review_count),
      },
      price: {
        min: row.price_min,
        max: row.price_max,
        currency: 'RUB',
        activeOfferCount: Number(row.active_offer_count),
      },
      image: row.primary_image_storage_key,
    };
  }

  // -------------------------------------------------------------------------
  // Карточка
  // -------------------------------------------------------------------------

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        shortName: true,
        registrationNumber: true,
        registrationDate: true,
        registrationExpiresAt: true,
        verifiedAt: true,
        description: true,
        manufacturer: {
          select: {
            id: true,
            name: true,
            website: true,
            country: { select: { id: true, iso2: true, name: true } },
            city: { select: { id: true, name: true } },
          },
        },
        category: { select: { id: true, name: true, slug: true } },
        riskClass: { select: { id: true, code: true, name: true } },
        originType: { select: { id: true, code: true, name: true } },
        currentRegistryStatus: { select: { id: true, code: true, name: true } },
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, storageKey: true, altText: true, sortOrder: true },
        },
        characteristicValues: {
          orderBy: { definition: { sortOrder: 'asc' } },
          select: {
            textValue: true,
            numericValue: true,
            booleanValue: true,
            dateValue: true,
            definition: {
              select: {
                id: true,
                code: true,
                name: true,
                isComparable: true,
                sortOrder: true,
                valueType: { select: { code: true } },
                unit: { select: { code: true, name: true, symbol: true } },
              },
            },
          },
        },
        statusHistory: {
          orderBy: { effectiveAt: 'desc' },
          select: {
            id: true,
            effectiveAt: true,
            comment: true,
            registryStatus: { select: { code: true, name: true } },
          },
        },
      },
    });

    if (!product) throw Problems.notFound('Изделие');

    const [derived] = await this.prisma.$queryRaw<
      {
        average_rating: number | null;
        review_count: number;
        organization_review_count: number;
        price_min: number | null;
        price_max: number | null;
        active_offer_count: number;
      }[]
    >`
      SELECT
        v.average_rating::float8 AS average_rating,
        v.review_count,
        v.organization_review_count,
        v.price_min::float8 AS price_min,
        v.price_max::float8 AS price_max,
        v.active_offer_count
      FROM product_catalog_view v
      WHERE v.product_id = ${id}::uuid
    `;

    return {
      id: product.id,
      name: product.name,
      shortName: product.shortName,
      registrationNumber: product.registrationNumber,
      registrationDate: product.registrationDate,
      registrationExpiresAt: product.registrationExpiresAt,
      verifiedAt: product.verifiedAt,
      description: product.description,
      manufacturer: {
        id: product.manufacturer.id,
        name: product.manufacturer.name,
        website: product.manufacturer.website,
        city: product.manufacturer.city?.name ?? null,
        country: product.manufacturer.country,
      },
      category: product.category,
      riskClass: product.riskClass,
      originType: product.originType,
      registryStatus: product.currentRegistryStatus,
      images: product.images.map((image) => ({
        id: image.id,
        storageKey: image.storageKey,
        altText: image.altText,
        sortOrder: image.sortOrder,
      })),
      // Характеристики возвращаются типизированными: форматирование
      // («12,1″», «4 часа») — дело клиента, API не склеивает строки.
      characteristics: product.characteristicValues.map((entry) => ({
        code: entry.definition.code,
        name: entry.definition.name,
        valueType: entry.definition.valueType.code,
        isComparable: entry.definition.isComparable,
        sortOrder: entry.definition.sortOrder,
        unit: entry.definition.unit
          ? {
              code: entry.definition.unit.code,
              name: entry.definition.unit.name,
              symbol: entry.definition.unit.symbol,
            }
          : null,
        value: this.readValue(entry),
      })),
      statusHistory: product.statusHistory.map((event) => ({
        id: event.id,
        effectiveAt: event.effectiveAt,
        comment: event.comment,
        status: event.registryStatus,
      })),
      rating: {
        average: derived?.average_rating ?? null,
        reviewCount: Number(derived?.review_count ?? 0),
        organizationReviewCount: Number(derived?.organization_review_count ?? 0),
      },
      price: {
        min: derived?.price_min ?? null,
        max: derived?.price_max ?? null,
        currency: 'RUB',
        activeOfferCount: Number(derived?.active_offer_count ?? 0),
      },
    };
  }

  /** Ровно одна из типизированных колонок заполнена — это гарантирует CHECK. */
  private readValue(entry: {
    textValue: string | null;
    numericValue: Prisma.Decimal | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
  }): string | number | boolean | Date | null {
    if (entry.textValue !== null) return entry.textValue;
    if (entry.numericValue !== null) return entry.numericValue.toNumber();
    if (entry.booleanValue !== null) return entry.booleanValue;
    if (entry.dateValue !== null) return entry.dateValue;
    return null;
  }

  // -------------------------------------------------------------------------
  // Связанные коллекции
  // -------------------------------------------------------------------------

  async findAnalogues(id: string) {
    await this.assertExists(id);

    const rows = await this.prisma.$queryRaw<
      (CatalogRow & { analogue_type_code: string; similarity_score: number | null })[]
    >`
      SELECT
        v.product_id, v.name, v.short_name, v.registration_number,
        v.registration_date, v.registration_expires_at, v.verified_at, v.description,
        v.manufacturer_id, v.manufacturer_name,
        v.country_id, v.country_iso2, v.country_name, v.manufacturer_city_name,
        v.category_id, v.category_name, v.category_slug,
        v.risk_class_id, v.risk_class_code,
        v.origin_type_id, v.origin_type_code,
        v.registry_status_id, v.registry_status_code, v.registry_status_name,
        v.average_rating::float8 AS average_rating,
        v.review_count, v.organization_review_count,
        v.price_min::float8 AS price_min, v.price_max::float8 AS price_max,
        v.active_offer_count, v.primary_image_storage_key,
        at.code AS analogue_type_code,
        pa.similarity_score::float8 AS similarity_score
      FROM product_analogues pa
      JOIN analogue_types at ON at.id = pa.analogue_type_id
      JOIN product_catalog_view v ON v.product_id = pa.analogue_product_id
      WHERE pa.product_id = ${id}::uuid
      ORDER BY pa.similarity_score DESC NULLS LAST, v.name ASC
    `;

    return rows.map((row) => ({
      ...this.toListItem(row),
      analogueType: row.analogue_type_code,
      similarityScore: row.similarity_score,
    }));
  }

  async findDocuments(id: string) {
    await this.assertExists(id);

    const documents = await this.prisma.productDocument.findMany({
      where: { productId: id },
      orderBy: [{ documentType: { code: 'asc' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        storageKey: true,
        documentNumber: true,
        issuedAt: true,
        validUntil: true,
        documentType: { select: { code: true, name: true } },
      },
    });

    return documents.map((document) => ({
      id: document.id,
      title: document.title,
      storageKey: document.storageKey,
      documentNumber: document.documentNumber,
      issuedAt: document.issuedAt,
      validUntil: document.validUntil,
      type: document.documentType,
    }));
  }

  /**
   * Опубликованные отзывы изделия.
   *
   * Бейдж verifiedOrganization вычисляется из текущего статуса организации
   * автора — он не хранится и не принимается от клиента (ADR 0003).
   */
  async findReviews(id: string, query: ProductReviewsQueryInput) {
    await this.assertExists(id);

    const offset = (query.page - 1) * query.limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId: id, reviewStatus: { code: 'published' } },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: query.limit,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          publishedAt: true,
          authorUser: { select: { id: true, displayName: true } },
          authorOrganization: {
            select: {
              id: true,
              name: true,
              shortName: true,
              verificationStatus: { select: { code: true } },
            },
          },
          experiencePeriod: { select: { code: true, name: true } },
          reviewStatus: { select: { code: true } },
        },
      }),
      this.prisma.review.count({
        where: { productId: id, reviewStatus: { code: 'published' } },
      }),
    ]);

    return {
      data: reviews.map((review) => ({
        id: review.id,
        productId: id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        createdAt: review.createdAt,
        publishedAt: review.publishedAt,
        status: review.reviewStatus.code,
        experience: review.experiencePeriod,
        author: {
          displayName: review.authorOrganization
            ? (review.authorOrganization.shortName ?? review.authorOrganization.name)
            : review.authorUser.displayName,
          type: review.authorOrganization ? 'organization' : 'user',
        },
        organization: review.authorOrganization
          ? {
              id: review.authorOrganization.id,
              name: review.authorOrganization.name,
              shortName: review.authorOrganization.shortName,
              verificationStatus: review.authorOrganization.verificationStatus.code,
            }
          : null,
        verifiedOrganization:
          review.authorOrganization?.verificationStatus.code === 'verified',
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw Problems.notFound('Изделие');
  }
}

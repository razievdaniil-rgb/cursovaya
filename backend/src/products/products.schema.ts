import { z } from 'zod';

/**
 * Параметры каталога.
 *
 * Пагинация — page/limit во всех списках API (выбор из CLAUDE.md: «cursor
 * pagination или page/limit последовательно»). Курсорная пагинация здесь
 * ничего не даёт: каталог сортируется по рейтингу и цене, то есть по
 * неуникальным и изменяемым полям, а размер выдачи измеряется тысячами, а не
 * миллионами записей.
 */

/** Повторяющийся query-параметр (?status=active&status=changed) или один. */
const repeatable = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = (Array.isArray(value) ? value : [value])
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length > 0 ? list : undefined;
  });

export const catalogSortValues = [
  'recommended',
  'price-asc',
  'price-desc',
  'rating-desc',
  'name-asc',
  'newest',
] as const;

export const catalogQuerySchema = z.object({
  search: z.string().trim().max(256).optional(),

  categorySlug: repeatable,
  categoryId: repeatable,
  manufacturerId: repeatable,
  countryIso2: repeatable,
  /** Коды из registry_statuses: active, changed, expiring, expired, suspended. */
  status: repeatable,
  /** Коды из risk_classes: 1, 2a, 2b, 3. */
  riskClass: repeatable,
  /** Коды из product_origin_types: domestic, imported. */
  originType: repeatable,

  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),

  sort: z.enum(catalogSortValues).default('recommended'),

  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).refine(
  (value) =>
    value.priceMin === undefined ||
    value.priceMax === undefined ||
    value.priceMin <= value.priceMax,
  { path: ['priceMin'], message: 'priceMin не может быть больше priceMax' },
);

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;

export const productIdSchema = z.object({
  id: z.string().uuid('Ожидается UUID изделия'),
});

export const productReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ProductReviewsQueryInput = z.infer<typeof productReviewsQuerySchema>;

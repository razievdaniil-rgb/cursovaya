-- Представления учатся работать с записями государственного реестра.
--
-- Реестр не содержит ни категории, ни происхождения изделия, ни страны
-- производителя, а класс риска заполнен у 0–3 % записей (ADR 0010). Поэтому
-- соответствующие внешние ключи стали необязательными — и производные
-- представления, написанные под seed, перестали годиться.
--
-- Две независимые проблемы.

-- 1. Каталог терял записи реестра целиком.
--
-- `product_catalog_view` соединял справочники внутренним JOIN, поэтому строка
-- с пустой категорией, классом риска, происхождением или страной
-- производителя из каталога просто исчезала. На seed это незаметно: там все
-- поля заполнены. После загрузки реестра так пропадали бы все 80 с лишним
-- тысяч записей — то есть интеграция была бы бесполезной.
--
-- Соединения становятся внешними: отсутствующее значение превращается в NULL
-- в соответствующих колонках, а изделие остаётся в каталоге.

DROP VIEW IF EXISTS product_catalog_view;

CREATE VIEW product_catalog_view AS
SELECT
  p.id AS product_id,
  p.name,
  p.short_name,
  p.registration_number,
  p.registration_date,
  p.registration_expires_at,
  p.verified_at,
  p.description,
  m.id AS manufacturer_id,
  m.name AS manufacturer_name,
  co.id AS country_id,
  co.iso2 AS country_iso2,
  co.name AS country_name,
  ci.name AS manufacturer_city_name,
  cat.id AS category_id,
  cat.name AS category_name,
  cat.slug AS category_slug,
  rc.id AS risk_class_id,
  rc.code AS risk_class_code,
  ot.id AS origin_type_id,
  ot.code AS origin_type_code,
  rs.id AS registry_status_id,
  rs.code AS registry_status_code,
  rs.name AS registry_status_name,
  rating.average_rating,
  rating.review_count,
  rating.organization_review_count,
  price.price_min,
  price.price_max,
  price.active_offer_count,
  img.storage_key AS primary_image_storage_key
FROM products p
JOIN manufacturers m ON m.id = p.manufacturer_id
LEFT JOIN countries co ON co.id = m.country_id
LEFT JOIN cities ci ON ci.id = m.city_id
LEFT JOIN product_categories cat ON cat.id = p.category_id
LEFT JOIN risk_classes rc ON rc.id = p.risk_class_id
LEFT JOIN product_origin_types ot ON ot.id = p.origin_type_id
JOIN registry_statuses rs ON rs.id = p.current_registry_status_id
LEFT JOIN product_rating_view rating ON rating.product_id = p.id
LEFT JOIN product_price_range_view price
       ON price.product_id = p.id AND price.currency_code = 'RUB'
LEFT JOIN LATERAL (
  SELECT pi.storage_key
  FROM product_images pi
  WHERE pi.product_id = p.id
  ORDER BY pi.sort_order
  LIMIT 1
) img ON TRUE;

COMMENT ON VIEW product_catalog_view IS
  'Производное представление поверх нормализованных таблиц. Не хранит данных. '
  'Справочники присоединяются внешним JOIN: у записей реестра категории, '
  'класса риска, происхождения и страны производителя нет (ADR 0010).';

-- 2. Доли считались от всех изделий, включая изделия с неизвестным
--    происхождением.
--
-- Знаменателем был `count(p.id)` — все изделия категории или периода. Пока
-- происхождение заполнено у всех, это верно. С записями реестра, где
-- происхождения нет, доля отечественных изделий сползла бы почти к нулю, а
-- доля импорта — тем более: не потому, что импорта стало больше, а потому,
-- что знаменатель вырос за счёт записей, про которые ничего не известно.
--
-- Поэтому доля считается по изделиям с известным происхождением, а изделия с
-- неизвестным выносятся в отдельную колонку `unknown_origin_products`.
-- Показатель остаётся осмысленным, а неполнота данных видна, а не спрятана в
-- знаменателе.

DROP MATERIALIZED VIEW IF EXISTS category_import_dependency_view;

CREATE MATERIALIZED VIEW category_import_dependency_view AS
SELECT
  cat.id AS category_id,
  cat.name AS category_name,
  cat.slug AS category_slug,
  count(p.id)::int AS total_products,
  count(p.id) FILTER (WHERE ot.code = 'imported')::int AS imported_products,
  count(p.id) FILTER (WHERE ot.code = 'domestic')::int AS domestic_products,
  count(p.id) FILTER (WHERE p.id IS NOT NULL AND ot.code IS NULL)::int
    AS unknown_origin_products,
  CASE
    WHEN count(p.id) FILTER (WHERE ot.code IS NOT NULL) = 0 THEN 0::numeric(5, 2)
    ELSE round(
      100.0 * count(p.id) FILTER (WHERE ot.code = 'imported')
            / count(p.id) FILTER (WHERE ot.code IS NOT NULL),
      2
    )
  END AS import_share_percent,
  -- Момент пересборки кэша (миграция 20261101000000).
  now() AS refreshed_at
FROM product_categories cat
LEFT JOIN products p ON p.category_id = cat.id
LEFT JOIN product_origin_types ot ON ot.id = p.origin_type_id
GROUP BY cat.id, cat.name, cat.slug;

CREATE UNIQUE INDEX "category_import_dependency_view_pk"
  ON category_import_dependency_view (category_id);

COMMENT ON MATERIALIZED VIEW category_import_dependency_view IS
  'Производный кэш. Доля импорта считается по изделиям с известным '
  'происхождением; остальные учтены в unknown_origin_products.';

DROP MATERIALIZED VIEW IF EXISTS domestic_share_by_period_view;

CREATE MATERIALIZED VIEW domestic_share_by_period_view AS
WITH bounds AS (
  SELECT
    min(date_part('year', registration_date))::int AS first_year,
    greatest(
      max(date_part('year', registration_date))::int,
      date_part('year', current_date)::int
    ) AS last_year
  FROM products
  WHERE registration_date IS NOT NULL
),
periods AS (
  SELECT generate_series(first_year, last_year) AS period_year FROM bounds
)
SELECT
  pr.period_year,
  count(p.id)::int AS total_products,
  count(p.id) FILTER (WHERE ot.code = 'domestic')::int AS domestic_products,
  count(p.id) FILTER (WHERE p.id IS NOT NULL AND ot.code IS NULL)::int
    AS unknown_origin_products,
  CASE
    WHEN count(p.id) FILTER (WHERE ot.code IS NOT NULL) = 0 THEN 0::numeric(5, 2)
    ELSE round(
      100.0 * count(p.id) FILTER (WHERE ot.code = 'domestic')
            / count(p.id) FILTER (WHERE ot.code IS NOT NULL),
      2
    )
  END AS domestic_share_percent,
  now() AS refreshed_at
FROM periods pr
LEFT JOIN products p
       ON p.registration_date IS NOT NULL
      AND date_part('year', p.registration_date) <= pr.period_year
LEFT JOIN product_origin_types ot ON ot.id = p.origin_type_id
GROUP BY pr.period_year;

CREATE UNIQUE INDEX "domestic_share_by_period_view_pk"
  ON domestic_share_by_period_view (period_year);

COMMENT ON MATERIALIZED VIEW domestic_share_by_period_view IS
  'Производный кэш. Доля отечественных изделий нарастающим итогом по годам, '
  'по изделиям с известным происхождением.';

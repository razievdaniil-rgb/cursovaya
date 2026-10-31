-- Время последнего обновления аналитических materialized views.
--
-- ADR 0006 обещает в ответе API поле refreshedAt: аналитика читается из
-- materialized views и может отставать от записи, и клиент должен видеть
-- насколько. PostgreSQL сам время обновления matview не хранит.
--
-- Решение: добавить в каждое представление колонку `now() AS refreshed_at`.
-- Внутри REFRESH MATERIALIZED VIEW now() возвращает timestamp транзакции
-- обновления, то есть ровно тот момент, когда кэш был пересобран. Отдельная
-- таблица-журнал для этого не нужна.
--
-- Представления — производный кэш, их пересоздание не теряет данных.

DROP MATERIALIZED VIEW IF EXISTS category_import_dependency_view;
DROP MATERIALIZED VIEW IF EXISTS domestic_share_by_period_view;

CREATE MATERIALIZED VIEW category_import_dependency_view AS
SELECT
  cat.id AS category_id,
  cat.name AS category_name,
  cat.slug AS category_slug,
  count(p.id)::int AS total_products,
  count(p.id) FILTER (WHERE ot.code = 'imported')::int AS imported_products,
  count(p.id) FILTER (WHERE ot.code = 'domestic')::int AS domestic_products,
  CASE
    WHEN count(p.id) = 0 THEN 0::numeric(5, 2)
    ELSE round(
      100.0 * count(p.id) FILTER (WHERE ot.code = 'imported') / count(p.id), 2
    )
  END AS import_share_percent,
  now() AS refreshed_at
FROM product_categories cat
LEFT JOIN products p ON p.category_id = cat.id
LEFT JOIN product_origin_types ot ON ot.id = p.origin_type_id
GROUP BY cat.id, cat.name, cat.slug;

CREATE UNIQUE INDEX "category_import_dependency_view_pk"
  ON category_import_dependency_view (category_id);

COMMENT ON MATERIALIZED VIEW category_import_dependency_view IS
  'Производный кэш. Пересоздание не теряет данных; источник — products.';

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
  CASE
    WHEN count(p.id) = 0 THEN 0::numeric(5, 2)
    ELSE round(
      100.0 * count(p.id) FILTER (WHERE ot.code = 'domestic') / count(p.id), 2
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
  'Производный кэш. Доля отечественных изделий нарастающим итогом по годам.';

-- Ограничения целостности, производный поисковый индекс и представления.
--
-- Содержимое этой миграции не выражается декларативной моделью Prisma
-- (см. backend/docs/adr/0002-postgresql-prisma.md). Базовые таблицы остаются
-- нормализованными; всё, что ниже, — либо ограничение, либо производное
-- представление, которое не является источником истины.

-- ===========================================================================
-- 1. CHECK-ограничения
-- ===========================================================================

-- Ровно одно типизированное значение характеристики. Соответствие
-- заполненной колонки типу из characteristic_definitions.value_type_id
-- проверяется на уровне сервиса (ссылочная проверка выходит за рамки
-- строчного CHECK).
ALTER TABLE "product_characteristic_values"
  ADD CONSTRAINT "product_characteristic_values_exactly_one_value_check"
  CHECK (
    (("text_value" IS NOT NULL)::int
      + ("numeric_value" IS NOT NULL)::int
      + ("boolean_value" IS NOT NULL)::int
      + ("date_value" IS NOT NULL)::int) = 1
  );

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range_check"
  CHECK ("rating" BETWEEN 1 AND 5);

-- Дата публикации не может опережать создание отзыва. Согласованность
-- published_at со статусом «published» требует обращения к справочнику
-- review_statuses, что в строчном CHECK недопустимо, поэтому она
-- обеспечивается сервисом ReviewsService при переходе статуса.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_published_at_order_check"
  CHECK ("published_at" IS NULL OR "published_at" >= "created_at");

ALTER TABLE "product_analogues"
  ADD CONSTRAINT "product_analogues_not_self_check"
  CHECK ("product_id" <> "analogue_product_id");

ALTER TABLE "product_analogues"
  ADD CONSTRAINT "product_analogues_similarity_range_check"
  CHECK ("similarity_score" IS NULL OR ("similarity_score" >= 0 AND "similarity_score" <= 1));

-- Максимум три изделия в сравнении. Вместе с UNIQUE (comparison_id, position)
-- это даёт жёсткую гарантию на уровне БД; сервис дополнительно выполняет
-- вставку в транзакции с блокировкой строки сравнения.
ALTER TABLE "comparison_items"
  ADD CONSTRAINT "comparison_items_position_range_check"
  CHECK ("position" BETWEEN 1 AND 3);

ALTER TABLE "supplier_offers"
  ADD CONSTRAINT "supplier_offers_price_non_negative_check"
  CHECK ("price" >= 0);

ALTER TABLE "supplier_offers"
  ADD CONSTRAINT "supplier_offers_validity_order_check"
  CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

ALTER TABLE "products"
  ADD CONSTRAINT "products_registration_period_check"
  CHECK (
    "registration_date" IS NULL
    OR "registration_expires_at" IS NULL
    OR "registration_expires_at" >= "registration_date"
  );

ALTER TABLE "product_documents"
  ADD CONSTRAINT "product_documents_validity_order_check"
  CHECK ("valid_until" IS NULL OR "issued_at" IS NULL OR "valid_until" >= "issued_at");

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_inn_format_check"
  CHECK ("inn" IS NULL OR "inn" ~ '^[0-9]{10}$' OR "inn" ~ '^[0-9]{12}$');

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_ogrn_format_check"
  CHECK ("ogrn" IS NULL OR "ogrn" ~ '^[0-9]{13}$' OR "ogrn" ~ '^[0-9]{15}$');

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_lifetime_check"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_lifetime_check"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_counters_non_negative_check"
  CHECK ("records_read" >= 0 AND "records_changed" >= 0 AND "error_count" >= 0);

ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_finish_order_check"
  CHECK ("finished_at" IS NULL OR "finished_at" >= "started_at");

ALTER TABLE "review_moderation_events"
  ADD CONSTRAINT "review_moderation_events_status_change_check"
  CHECK ("from_status_id" <> "to_status_id");

-- ===========================================================================
-- 2. Производный полнотекстовый индекс
-- ===========================================================================
--
-- product_search_documents — кэш, а не источник истины: таблицу можно
-- полностью очистить и пересобрать вызовом rebuild_all_product_search_documents().
-- Поэтому денормализация имени производителя внутри tsvector не нарушает 3НФ
-- базовых отношений.

CREATE OR REPLACE FUNCTION build_product_search_vector(p_product_id uuid)
RETURNS tsvector
LANGUAGE sql
STABLE
AS $$
  SELECT
    setweight(to_tsvector('russian', coalesce(p.name, '')), 'A')
    || setweight(to_tsvector('russian', coalesce(p.short_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(p.registration_number, '')), 'A')
    || setweight(to_tsvector('russian', coalesce(m.name, '')), 'B')
    || setweight(to_tsvector('russian', coalesce(p.description, '')), 'D')
  FROM products p
  JOIN manufacturers m ON m.id = p.manufacturer_id
  WHERE p.id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION refresh_product_search_document(p_product_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO product_search_documents (product_id, search_vector, updated_at)
  VALUES (p_product_id, build_product_search_vector(p_product_id), now())
  ON CONFLICT (product_id) DO UPDATE
    SET search_vector = EXCLUDED.search_vector,
        updated_at = EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION rebuild_all_product_search_documents()
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO product_search_documents (product_id, search_vector, updated_at)
  SELECT p.id, build_product_search_vector(p.id), now()
  FROM products p
  ON CONFLICT (product_id) DO UPDATE
    SET search_vector = EXCLUDED.search_vector,
        updated_at = EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION trg_products_refresh_search_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM refresh_product_search_document(NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER products_search_document_sync
AFTER INSERT OR UPDATE OF name, short_name, registration_number, description, manufacturer_id
ON products
FOR EACH ROW
EXECUTE FUNCTION trg_products_refresh_search_document();

-- Переименование производителя должно обновить поисковый индекс его изделий.
CREATE OR REPLACE FUNCTION trg_manufacturers_refresh_search_documents()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO product_search_documents (product_id, search_vector, updated_at)
  SELECT p.id, build_product_search_vector(p.id), now()
  FROM products p
  WHERE p.manufacturer_id = NEW.id
  ON CONFLICT (product_id) DO UPDATE
    SET search_vector = EXCLUDED.search_vector,
        updated_at = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;

CREATE TRIGGER manufacturers_search_document_sync
AFTER UPDATE OF name
ON manufacturers
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION trg_manufacturers_refresh_search_documents();

CREATE INDEX "product_search_documents_vector_idx"
  ON "product_search_documents" USING gin ("search_vector");

-- Подстрочный поиск по регистрационному номеру («21851» внутри «РЗН 2024/21851»).
CREATE INDEX "products_registration_number_trgm_idx"
  ON "products" USING gin ("registration_number" gin_trgm_ops);

CREATE INDEX "manufacturers_name_trgm_idx"
  ON "manufacturers" USING gin ("name" gin_trgm_ops);

-- ===========================================================================
-- 3. Представления актуальных производных значений
-- ===========================================================================

-- Рейтинг и счётчики отзывов. В products этих колонок нет и не будет.
CREATE VIEW product_rating_view AS
SELECT
  p.id AS product_id,
  count(r.id)::int AS review_count,
  count(r.id) FILTER (WHERE r.author_organization_id IS NOT NULL)::int
    AS organization_review_count,
  CASE
    WHEN count(r.id) = 0 THEN NULL
    ELSE round(avg(r.rating)::numeric, 2)
  END AS average_rating
FROM products p
LEFT JOIN (
  SELECT r.*
  FROM reviews r
  JOIN review_statuses rs ON rs.id = r.review_status_id
  WHERE rs.code = 'published'
) r ON r.product_id = p.id
GROUP BY p.id;

COMMENT ON VIEW product_rating_view IS
  'Производное представление. Источник истины — таблица reviews.';

-- Диапазон цен строится только по предложениям, действующим на момент запроса.
CREATE VIEW product_price_range_view AS
SELECT
  p.id AS product_id,
  cur.code AS currency_code,
  min(o.price) AS price_min,
  max(o.price) AS price_max,
  count(o.id)::int AS active_offer_count
FROM products p
LEFT JOIN supplier_offers o
  ON o.product_id = p.id
 AND o.valid_from <= now()
 AND (o.valid_until IS NULL OR o.valid_until > now())
LEFT JOIN currencies cur ON cur.id = o.currency_id
GROUP BY p.id, cur.code;

COMMENT ON VIEW product_price_range_view IS
  'Производное представление. Источник истины — таблица supplier_offers.';

-- Карточка каталога: всё, что нужно списку, одним запросом.
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
JOIN countries co ON co.id = m.country_id
LEFT JOIN cities ci ON ci.id = m.city_id
JOIN product_categories cat ON cat.id = p.category_id
JOIN risk_classes rc ON rc.id = p.risk_class_id
JOIN product_origin_types ot ON ot.id = p.origin_type_id
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
  'Производное представление поверх нормализованных таблиц. Не хранит данных.';

-- Проблемные изделия для государственного раздела.
CREATE VIEW problem_products_view AS
SELECT
  p.id AS product_id,
  p.name,
  p.registration_number,
  rs.code AS registry_status_code,
  p.registration_expires_at,
  (p.registration_expires_at IS NOT NULL
    AND p.registration_expires_at < current_date) AS registration_expired,
  (p.registration_expires_at IS NOT NULL
    AND p.registration_expires_at >= current_date
    AND p.registration_expires_at <= current_date + 90) AS registration_expiring,
  (rs.code IN ('suspended', 'expired')) AS status_blocking,
  rating.average_rating,
  coalesce(critical.critical_review_count, 0)::int AS critical_review_count,
  coalesce(price.active_offer_count, 0)::int AS active_offer_count,
  (coalesce(price.active_offer_count, 0) = 0) AS without_active_offers
FROM products p
JOIN registry_statuses rs ON rs.id = p.current_registry_status_id
LEFT JOIN product_rating_view rating ON rating.product_id = p.id
LEFT JOIN product_price_range_view price
       ON price.product_id = p.id AND price.currency_code = 'RUB'
LEFT JOIN (
  SELECT r.product_id, count(*)::int AS critical_review_count
  FROM reviews r
  JOIN review_statuses rs2 ON rs2.id = r.review_status_id
  WHERE rs2.code = 'published' AND r.rating <= 2
  GROUP BY r.product_id
) critical ON critical.product_id = p.id
WHERE
     rs.code IN ('suspended', 'expired')
  OR (p.registration_expires_at IS NOT NULL
      AND p.registration_expires_at <= current_date + 90)
  OR coalesce(critical.critical_review_count, 0) > 0
  OR coalesce(price.active_offer_count, 0) = 0;

COMMENT ON VIEW problem_products_view IS
  'Производное представление. Критерии проблемности вычисляются на лету.';

-- Сводка кабинета медорганизации.
CREATE VIEW organization_dashboard_view AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  ovs.code AS verification_status_code,
  (SELECT count(DISTINCT sli.product_id)
     FROM saved_lists sl
     JOIN saved_list_items sli ON sli.saved_list_id = sl.id
    WHERE sl.organization_id = o.id)::int AS saved_product_count,
  (SELECT count(DISTINCT c.id)
     FROM comparisons c
     JOIN organization_members om ON om.user_id = c.owner_user_id
    WHERE om.organization_id = o.id)::int AS comparison_count,
  (SELECT count(*)
     FROM reviews r
    WHERE r.author_organization_id = o.id)::int AS review_count,
  (SELECT count(*)
     FROM reviews r
     JOIN review_statuses rs ON rs.id = r.review_status_id
    WHERE r.author_organization_id = o.id
      AND rs.code = 'moderation')::int AS reviews_on_moderation_count,
  (SELECT count(*)
     FROM notification_recipients nr
     JOIN organization_members om ON om.user_id = nr.user_id
    WHERE om.organization_id = o.id
      AND nr.read_at IS NULL)::int AS unread_notification_count,
  (SELECT count(*) FROM organization_members om WHERE om.organization_id = o.id)::int
    AS member_count
FROM organizations o
JOIN organization_verification_statuses ovs ON ovs.id = o.verification_status_id;

COMMENT ON VIEW organization_dashboard_view IS
  'Производное представление. Все счётчики считаются из нормализованных таблиц.';

-- ===========================================================================
-- 4. Materialized views для аналитики
-- ===========================================================================

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
  END AS import_share_percent
FROM product_categories cat
LEFT JOIN products p ON p.category_id = cat.id
LEFT JOIN product_origin_types ot ON ot.id = p.origin_type_id
GROUP BY cat.id, cat.name, cat.slug;

-- UNIQUE-индекс обязателен для REFRESH ... CONCURRENTLY.
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
  END AS domestic_share_percent
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

-- Вызывается после успешного sync_run и по расписанию.
CREATE OR REPLACE FUNCTION refresh_analytics_views(p_concurrently boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_concurrently THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY category_import_dependency_view;
    REFRESH MATERIALIZED VIEW CONCURRENTLY domestic_share_by_period_view;
  ELSE
    REFRESH MATERIALIZED VIEW category_import_dependency_view;
    REFRESH MATERIALIZED VIEW domestic_share_by_period_view;
  END IF;
END;
$$;

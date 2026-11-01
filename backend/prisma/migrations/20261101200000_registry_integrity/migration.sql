-- Apply with import workers stopped. Existing unfinished runs are intentionally
-- NOT auto-finished: an old timestamp cannot prove the worker is dead.
-- If multiple unfinished runs exist for a source, migration fails safely.
-- Recover explicitly only after stopping/verifying the owner worker; preserve
-- counters/errors and set failed status + finished_at in the same operation.
CREATE UNIQUE INDEX "sync_runs_one_unfinished_per_source"
  ON "sync_runs" ("sync_source_id") WHERE "finished_at" IS NULL;

-- Manufacturer identities are namespaced deterministic UUIDs from source
-- name+address (or external record id for an unknown producer), requiring no
-- lossy global uniqueness or rewriting existing curated manufacturers.

CREATE OR REPLACE VIEW problem_products_view AS
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
  (rs.code IN ('suspended', 'expired', 'cancelled', 'invalid')) AS status_blocking,
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
     rs.code IN ('suspended', 'expired', 'cancelled', 'invalid')
  OR (p.registration_expires_at IS NOT NULL
      AND p.registration_expires_at <= current_date + 90)
  OR coalesce(critical.critical_review_count, 0) > 0
  OR coalesce(price.active_offer_count, 0) = 0;

COMMENT ON VIEW problem_products_view IS
  'Производное представление. Критерии проблемности вычисляются на лету.';


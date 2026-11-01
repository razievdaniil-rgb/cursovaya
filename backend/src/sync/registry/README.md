# Registry import integrity

Apply forward migration `20261101200000_registry_integrity` before running workers.
It adds one unfinished run per source (`finished_at IS NULL`) and treats
cancelled/invalid statuses as blocking in `problem_products_view`.
Stop import workers while applying the migration. It deliberately fails if
duplicate unfinished runs already exist, without rewriting journal records.

Crash recovery is manual and fail closed: first stop/verify the owning worker,
then mark that specific unfinished run failed and set its finish time, preserving
its progress/errors. Never reclaim solely by age: a slow worker may still write.
No database connection/transaction is held over the full import or network waits.
Each source record uses a short serializable transaction with bounded retries.

HTTP callers should use `start(userId, options)` and respond with 202. It returns
`{runId, status: 'running'}` immediately after the run is persisted, before registry
network I/O. Background promises are tracked in memory and every rejection is
observed/logged; `run()` finalizes the persisted journal. Setup/disabled-source/
active-run failures before persistence reject `start()`. `run()` remains the
awaitable result API for tests/CLI. There is no durable queue or automatic
restart/reclaim after process failure.

The external registry ID is authoritative. A matching registration number on a
different product (including a curated/demo product without a registry ID) is
an explicit conflict; imports never adopt that product. Manufacturer IDs are
UUID v8 values derived from namespaced SHA-256 of exact trimmed NFC name/address
pairs; unknown producers are scoped to external record IDs. Existing legacy
manufacturers are not bulk merged or rewritten.

Result fields remain available, with these additions:
- `complete`: reached final page, stable source totals, matching raw count,
  no repeated external IDs. Rejections may still make the run partial.
- `pagesRead`, `rejected`, `warnings`, `analyticsRefreshed`.
- `recordsRead` now counts all raw rows, including parser rejections;
  `skipped` includes rejected and failed records.
Journal issues are capped at 100 stored details per run; counters count all issues.
Partial completion summaries are persisted in `sync_runs.error_message`.
Registration dates stay source dates; verification/history use observation time.
Analytics refresh runs after traversal, including truncated/rejected loads, and
after committed writes if a later page fails. Refresh failures become warnings.

## Validation

Database-free:
`npm run test:unit -- test/unit/roszdravnadzor-registry.provider.spec.ts test/unit/registry-sync.service.spec.ts`

Parent runs integration tests sequentially, after migrations + seed:
`npm run test:integration -- test/registry.e2e.spec.ts`

Required test environment:
- `DATABASE_URL`: dedicated test database only.
- `REGISTRY_TEST_DATABASE_NAME`: exact database name, beginning with
  `cursovaya_test_` or `cursovaya_completion_`.
  Default: `cursovaya_completion_20261101`.
- `SEED_DEV_PASSWORD`: password used when seeding that database.
- Standard application test env (JWT/cookie secrets, etc.) remains required.
The suite sets the local registry fixture and refuses fixture identity collisions.
Network tests are disabled unless `REGISTRY_NETWORK_TEST=true`; real network
calls also need the trusted CA via `NODE_EXTRA_CA_CERTS`.
The provider bounds each network request, including body consumption, to 30 s.

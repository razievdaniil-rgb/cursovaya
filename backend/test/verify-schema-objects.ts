/**
 * Проверка, что миграция 0002 действительно создала всё, что обещает.
 *
 * Запускается в CI сразу после `prisma migrate deploy` на чистой базе:
 * `prisma migrate diff` сравнивает только таблицы и колонки, а CHECK-ограничения,
 * триггеры, функции и представления остаются вне его поля зрения.
 *
 * Запуск: npx tsx test/verify-schema-objects.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPECTED_CHECK_CONSTRAINTS = [
  'product_characteristic_values_exactly_one_value_check',
  'reviews_rating_range_check',
  'reviews_published_at_order_check',
  'product_analogues_not_self_check',
  'product_analogues_similarity_range_check',
  'comparison_items_position_range_check',
  'supplier_offers_price_non_negative_check',
  'supplier_offers_validity_order_check',
  'products_registration_period_check',
  'product_documents_validity_order_check',
  'organizations_inn_format_check',
  'organizations_ogrn_format_check',
  'refresh_tokens_lifetime_check',
  'password_reset_tokens_lifetime_check',
  'sync_runs_counters_non_negative_check',
  'sync_runs_finish_order_check',
  'review_moderation_events_status_change_check',
];

const EXPECTED_VIEWS = [
  'product_rating_view',
  'product_price_range_view',
  'product_catalog_view',
  'problem_products_view',
  'organization_dashboard_view',
];

const EXPECTED_MATERIALIZED_VIEWS = [
  'category_import_dependency_view',
  'domestic_share_by_period_view',
];

const EXPECTED_FUNCTIONS = [
  'build_product_search_vector',
  'refresh_product_search_document',
  'rebuild_all_product_search_documents',
  'refresh_analytics_views',
];

const EXPECTED_TRIGGERS = [
  'products_search_document_sync',
  'manufacturers_search_document_sync',
];

const EXPECTED_EXTENSIONS = ['citext', 'pg_trgm'];

const EXPECTED_SPECIAL_INDEXES = [
  'product_search_documents_vector_idx',
  'products_registration_number_trgm_idx',
  'manufacturers_name_trgm_idx',
  'category_import_dependency_view_pk',
  'domestic_share_by_period_view_pk',
];

const EXPECTED_TABLE_COUNT = 53;

const failures: string[] = [];

function expectAll(label: string, expected: string[], actual: string[]): void {
  const missing = expected.filter((name) => !actual.includes(name));
  if (missing.length > 0) {
    failures.push(`${label}: не найдено — ${missing.join(', ')}`);
  } else {
    console.log(`  OK  ${label} (${expected.length})`);
  }
}

async function names(sql: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(sql);
  return rows.map((row) => row.name);
}

async function main(): Promise<void> {
  console.log('Проверка объектов схемы:');

  expectAll(
    'расширения',
    EXPECTED_EXTENSIONS,
    await names(`SELECT extname AS name FROM pg_extension`),
  );

  expectAll(
    'CHECK-ограничения',
    EXPECTED_CHECK_CONSTRAINTS,
    await names(
      `SELECT conname AS name FROM pg_constraint WHERE contype = 'c'`,
    ),
  );

  expectAll(
    'представления',
    EXPECTED_VIEWS,
    await names(
      `SELECT table_name AS name FROM information_schema.views
        WHERE table_schema = 'public'`,
    ),
  );

  expectAll(
    'materialized views',
    EXPECTED_MATERIALIZED_VIEWS,
    await names(
      `SELECT matviewname AS name FROM pg_matviews WHERE schemaname = 'public'`,
    ),
  );

  expectAll(
    'функции',
    EXPECTED_FUNCTIONS,
    await names(
      `SELECT p.proname AS name
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'`,
    ),
  );

  expectAll(
    'триггеры',
    EXPECTED_TRIGGERS,
    await names(
      `SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal`,
    ),
  );

  expectAll(
    'специальные индексы',
    EXPECTED_SPECIAL_INDEXES,
    await names(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
    ),
  );

  // Таблицы: 18 справочников + 35 таблиц предметной области (включая
  // номенклатурную классификацию из открытых данных, ADR 0009).
  // _prisma_migrations исключается — это служебная таблица Prisma.
  const [tableCount] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'`,
  );

  const actualTables = Number(tableCount?.count ?? 0);
  if (actualTables !== EXPECTED_TABLE_COUNT) {
    failures.push(
      `таблиц: ожидалось ${EXPECTED_TABLE_COUNT}, найдено ${actualTables}`,
    );
  } else {
    console.log(`  OK  таблиц (${actualTables})`);
  }

  // Локаль базы: русский стемминг молча деградирует, если lc_ctype не знает
  // кириллицу (например, при --locale=C). Тогда to_tsvector('russian', ...)
  // не приводит слова к нижнему регистру, и поиск по производителю не
  // находит ничего. Проверяем поведение, а не имя локали.
  const [stemming] = await prisma.$queryRaw<
    { lowercased: boolean; stemmed: boolean; ctype: string }[]
  >`
    SELECT to_tsvector('russian', 'НПП Биосигнал')::text NOT LIKE '%НПП%' AS lowercased,
           to_tsvector('russian', 'НПП Биосигнал')
             @@ plainto_tsquery('russian', 'биосигнал') AS stemmed,
           (SELECT datctype FROM pg_database WHERE datname = current_database()) AS ctype
  `;

  if (stemming?.lowercased && stemming?.stemmed) {
    console.log(`  OK  локаль БД поддерживает русский стемминг (${stemming.ctype})`);
  } else {
    failures.push(
      `локаль БД: datctype = ${stemming?.ctype} — кириллица не приводится к ` +
        'нижнему регистру, полнотекстовый поиск по русским словам работать не ' +
        'будет. Пересоздайте базу с UTF-8-совместимым lc_ctype ' +
        '(C.UTF-8, ru-RU или ru_RU.UTF-8).',
    );
  }

  // Поведенческие проверки вставляют строки, которые обязаны быть отклонены.
  // На пустой базе `INSERT ... SELECT` не вставил бы ни одной строки и
  // «прошёл» бы успешно, ничего не проверив, поэтому они требуют seed.
  const productCount = await prisma.product.count();
  const comparisonCount = await prisma.comparison.count();

  if (productCount === 0 || comparisonCount === 0) {
    console.log(
      '\n  SKIP поведенческие проверки CHECK: база без данных. ' +
        'Запустите скрипт после `npm run db:seed`.',
    );
  } else {
    await assertRejected(
      'CHECK ровно одного значения характеристики',
      `INSERT INTO product_characteristic_values
         (id, product_id, characteristic_definition_id, text_value, numeric_value)
       SELECT gen_random_uuid(), p.id, d.id, 'текст', 42
         FROM products p, characteristic_definitions d LIMIT 1`,
    );

    await assertRejected(
      'CHECK запрета аналога самому себе',
      `INSERT INTO product_analogues
         (product_id, analogue_product_id, analogue_type_id)
       SELECT p.id, p.id, t.id FROM products p, analogue_types t LIMIT 1`,
    );

    await assertRejected(
      'CHECK диапазона позиции сравнения',
      `INSERT INTO comparison_items (comparison_id, product_id, position)
       SELECT c.id, p.id, 4 FROM comparisons c, products p LIMIT 1`,
    );

    await assertRejected(
      'CHECK диапазона оценки отзыва',
      `UPDATE reviews SET rating = 7 WHERE id = (SELECT id FROM reviews LIMIT 1)`,
    );
  }

  if (failures.length > 0) {
    console.error('\nПроверка не пройдена:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nВсе объекты схемы на месте.');
}

/** Ожидает, что запрос упадёт: иначе ограничение не работает. */
async function assertRejected(label: string, sql: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error('__rollback__');
    });
    failures.push(`${label}: запрос прошёл, хотя должен был быть отклонён`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('__rollback__')) {
      failures.push(`${label}: запрос прошёл, хотя должен был быть отклонён`);
    } else {
      console.log(`  OK  ${label}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Ошибка проверки:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

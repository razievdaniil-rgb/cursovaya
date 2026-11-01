/**
 * Проверка идемпотентности seed и корректности производных представлений.
 *
 * Скрипт снимает количество строк во всех таблицах, запускает seed повторно
 * и сравнивает снимки. Любое расхождение означает, что seed создаёт дубликаты.
 * Дополнительно проверяется, что представления возвращают значения,
 * согласованные с seed-данными.
 *
 * Запуск: npx tsx test/verify-seed-idempotent.ts
 */

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const failures: string[] = [];

type Snapshot = Record<string, number>;

async function snapshot(): Promise<Snapshot> {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name <> '_prisma_migrations'
     ORDER BY table_name
  `;

  const counts: Snapshot = {};
  for (const { table_name } of tables) {
    const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "${table_name}"`,
    );
    counts[table_name] = Number(row?.count ?? 0);
  }

  return counts;
}

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  OK  ${label}`);
  } else {
    failures.push(`${label}: ${detail}`);
  }
}

async function verifyDerivedValues(): Promise<void> {
  console.log('\nПроверка производных представлений:');

  // Диапазон цен: истёкшее предложение (на 20 % дешевле) не должно учитываться.
  const prices = await prisma.$queryRaw<
    { short_name: string; price_min: string; price_max: string; active_offer_count: number }[]
  >`
    SELECT short_name, price_min::text, price_max::text, active_offer_count
      FROM product_catalog_view
     ORDER BY short_name
  `;

  const expectedPrices: Record<string, [number, number]> = {
    'МП-12': [284000, 319000],
    'Вектор-8': [319000, 352000],
    Vismo: [512000, 590000],
    'МИТАР-01': [246000, 278000],
  };

  for (const row of prices) {
    const expected = expectedPrices[row.short_name];
    if (!expected) continue;

    check(
      `диапазон цен ${row.short_name}`,
      Number(row.price_min) === expected[0] && Number(row.price_max) === expected[1],
      `ожидалось ${expected[0]}–${expected[1]}, получено ${row.price_min}–${row.price_max}`,
    );

    check(
      `истёкшее предложение исключено (${row.short_name})`,
      row.active_offer_count === 2,
      `активных предложений ${row.active_offer_count}, ожидалось 2 из 3`,
    );
  }

  // Рейтинг считается только по опубликованным отзывам.
  const ratings = await prisma.$queryRaw<
    { short_name: string; average_rating: string | null; review_count: number }[]
  >`
    SELECT short_name, average_rating::text, review_count
      FROM product_catalog_view
     ORDER BY short_name
  `;

  const mp12 = ratings.find((row) => row.short_name === 'МП-12');
  check(
    'рейтинг МП-12 по двум опубликованным отзывам',
    Number(mp12?.average_rating) === 4.5 && mp12?.review_count === 2,
    `получено rating=${mp12?.average_rating}, count=${mp12?.review_count}, ожидалось 4.50 и 2`,
  );

  const vector8 = ratings.find((row) => row.short_name === 'Вектор-8');
  check(
    'отзыв на модерации не влияет на рейтинг Вектор-8',
    vector8?.review_count === 0 && vector8?.average_rating === null,
    `получено rating=${vector8?.average_rating}, count=${vector8?.review_count}, ожидалось NULL и 0`,
  );

  // Полнотекстовый поиск: название, производитель, описание.
  for (const [term, expectedShortName] of [
    ['монитор', 'МП-12'],
    ['биосигнал', 'Вектор-8'],
  ] as const) {
    const found = await prisma.$queryRaw<{ short_name: string }[]>`
      SELECT p.short_name
        FROM product_search_documents d
        JOIN products p ON p.id = d.product_id
       WHERE d.search_vector @@ plainto_tsquery('russian', ${term})
    `;

    check(
      `полнотекстовый поиск «${term}»`,
      found.some((row) => row.short_name === expectedShortName),
      `не найдено «${expectedShortName}»; найдено: ${found.map((r) => r.short_name).join(', ') || '(ничего)'}`,
    );
  }

  // Поиск по регистрационному номеру.
  const byNumber = await prisma.$queryRaw<{ short_name: string }[]>`
    SELECT p.short_name
      FROM product_search_documents d
      JOIN products p ON p.id = d.product_id
     WHERE d.search_vector @@ plainto_tsquery('simple', '2024/21851')
  `;
  check(
    'полнотекстовый поиск по регистрационному номеру',
    byNumber.some((row) => row.short_name === 'МП-12'),
    `найдено: ${byNumber.map((r) => r.short_name).join(', ') || '(ничего)'}`,
  );

  // Проблемные изделия: МИТАР-01 истекает и имеет критический отзыв.
  const problems = await prisma.$queryRaw<
    { name: string; registration_expiring: boolean; critical_review_count: number }[]
  >`SELECT name, registration_expiring, critical_review_count FROM problem_products_view`;

  check(
    'problem_products_view находит МИТАР-01',
    problems.some(
      (row) =>
        row.name.includes('МИТАР-01') &&
        row.registration_expiring &&
        row.critical_review_count === 1,
    ),
    `получено: ${JSON.stringify(problems)}`,
  );

  // Кабинет организации.
  const dashboard = await prisma.$queryRaw<
    {
      organization_name: string;
      saved_product_count: number;
      review_count: number;
      unread_notification_count: number;
    }[]
  >`
    SELECT organization_name, saved_product_count, review_count, unread_notification_count
      FROM organization_dashboard_view
     WHERE verification_status_code = 'verified'
       AND saved_product_count > 0
  `;

  const clinic = dashboard[0];
  check(
    'organization_dashboard_view: 2 сохранённых изделия',
    clinic?.saved_product_count === 2,
    `получено ${clinic?.saved_product_count}`,
  );
  check(
    'organization_dashboard_view: 3 непрочитанных уведомления',
    clinic?.unread_notification_count === 3,
    `получено ${clinic?.unread_notification_count}`,
  );

  // Аналитика: 3 отечественных из 4 изделий = 75 %.
  const domestic = await prisma.$queryRaw<
    { period_year: number; domestic_share_percent: string; total_products: number }[]
  >`
    SELECT period_year, domestic_share_percent::text, total_products
      FROM domestic_share_by_period_view
     ORDER BY period_year DESC
     LIMIT 1
  `;

  check(
    'domestic_share_by_period_view: 75 % за последний период',
    Number(domestic[0]?.domestic_share_percent) === 75 &&
      domestic[0]?.total_products === 4,
    `получено ${domestic[0]?.domestic_share_percent} % при ${domestic[0]?.total_products} изделиях`,
  );

  const imports = await prisma.$queryRaw<
    { category_name: string; import_share_percent: string; total_products: number }[]
  >`
    SELECT category_name, import_share_percent::text, total_products
      FROM category_import_dependency_view
     WHERE total_products > 0
  `;

  check(
    'category_import_dependency_view: 25 % импорта в «Диагностике»',
    Number(imports[0]?.import_share_percent) === 25 && imports[0]?.total_products === 4,
    `получено ${JSON.stringify(imports)}`,
  );
}

async function main(): Promise<void> {
  console.log('Снимок до повторного seed...');
  const before = await snapshot();
  const totalBefore = Object.values(before).reduce((sum, n) => sum + n, 0);
  console.log(`  строк всего: ${totalBefore} в ${Object.keys(before).length} таблицах`);

  if (totalBefore === 0) {
    console.error('База пуста — сначала выполните `npm run db:seed`.');
    process.exitCode = 1;
    return;
  }

  console.log('\nПовторный запуск seed...');
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log('\nСнимок после повторного seed...');
  const after = await snapshot();

  console.log('\nСравнение количества строк:');
  for (const table of Object.keys(before)) {
    if (before[table] !== after[table]) {
      failures.push(
        `${table}: было ${before[table]}, стало ${after[table]} — seed не идемпотентен`,
      );
    }
  }

  if (failures.length === 0) {
    console.log(`  OK  все ${Object.keys(before).length} таблиц без изменений`);
  }

  await verifyDerivedValues();

  if (failures.length > 0) {
    console.error('\nПроверка не пройдена:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nSeed идемпотентен, представления согласованы с данными.');
}

main()
  .catch((error) => {
    console.error('Ошибка проверки:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

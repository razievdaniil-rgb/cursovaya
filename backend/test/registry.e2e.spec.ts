/**
 * Интеграционные тесты загрузки государственного реестра (ADR 0010).
 *
 * Страница источника берётся из локальной фикстуры: CI не должен зависеть ни
 * от доступности elk.roszdravnadzor.gov.ru, ни от доверия к сертификату
 * национального УЦ. Обращение к сети проверяется отдельным тестом, который
 * включается переменной REGISTRY_NETWORK_TEST.
 *
 * Записи реестра попадают в те же `products`, что и демонстрационные, поэтому
 * тест убирает за собой всё, что создал.
 */

import fastifyCookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { RegistrySyncService } from '../src/sync/registry/registry-sync.service';
import type { RegistryEntry, RegistryPage } from '../src/sync/registry/registry.types';
import type { RegistrySyncResult } from '../src/sync/registry/registry-sync.service';
import { RoszdravnadzorRegistryProvider } from '../src/sync/registry/roszdravnadzor-registry.provider';

const FIXTURE = resolve(__dirname, 'fixtures/registry-page.json');

/** Регистрационные номера фикстуры: по ним идёт уборка. */
const FIXTURE_NUMBERS = [
  'ФС 012а2004/0344-04',
  'ФС 022а1307/0383-04',
  'ФС 01012002/9999-06',
  'ФС 99999/0001-26',
  'ФС 99999/0002-26',
  'ФС 99999/0003-26',
];

/** Производители, которых создаёт загрузка фикстуры. */
const FIXTURE_MANUFACTURERS = [
  'АОЗТ"Декор"',
  'ООО НПП "ВЕНД"',
  'ООО «Аномалия»',
  'ООО «Недействующий»',
  'Производитель не указан',
];

let app: NestFastifyApplication;
let prisma: PrismaService;
let sync: RegistrySyncService;
let result: RegistrySyncResult;
let syncRunIdsBefore: string[] = [];
let manufacturerIdsBefore: string[] = [];
let fixtureOwnershipEstablished = false;
const FIXTURE_EXTERNAL_IDS = [42311, 42305, 999001, 999002, 999003, 999004, 999005];

async function cleanUp(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { externalRegistryId: { in: FIXTURE_EXTERNAL_IDS } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);

  if (productIds.length > 0) {
    await prisma.registryStatusHistory.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }


  // Only registry runs created during this suite; preserve preexisting journal.
  await prisma.syncRun.deleteMany({
    where: { syncSource: { code: RoszdravnadzorRegistryProvider.CODE },
      id: { notIn: syncRunIdsBefore } },
  });
  for (const name of FIXTURE_MANUFACTURERS) {
    await prisma.manufacturer.deleteMany({
      where: { name, id: { notIn: manufacturerIdsBefore }, products: { none: {} } },
    });
  }
  // Imports refresh these caches; restore them after removing owned fixtures
  // so subsequent sequential integration suites observe seed data again.
  await prisma.refreshAnalyticsViews(true);
}

beforeAll(async () => {
  // Refuse to initialize Prisma against an accidental developer/user database.
  const expected = process.env.REGISTRY_TEST_DATABASE_NAME ?? 'cursovaya_completion_20261101';
  const database = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/undefined');
  if (!/^cursovaya_(completion|test)_/.test(expected) ||
      decodeURIComponent(database.pathname.slice(1)) !== expected) {
    throw new Error('Registry integration requires a dedicated test DB; set DATABASE_URL and REGISTRY_TEST_DATABASE_NAME');
  }
  process.env.THROTTLE_DISABLED = 'true';
  // Источник подменяется локальным файлом, а не адресом в сети.
  process.env.REGISTRY_LOCAL_FILE = FIXTURE;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);
  sync = app.get(RegistrySyncService);

  syncRunIdsBefore = (await prisma.syncRun.findMany({ select: { id: true } })).map(
    (row) => row.id,
  );

  manufacturerIdsBefore = (await prisma.manufacturer.findMany({ select: { id: true } })).map((row) => row.id);
  if (await prisma.product.count({ where: { OR: [
    { externalRegistryId: { in: FIXTURE_EXTERNAL_IDS } },
    { registrationNumber: { in: FIXTURE_NUMBERS } },
  ] } })) throw new Error('Registry fixture identities already exist; refusing to overwrite them');
  fixtureOwnershipEstablished = true;
  result = await sync.run(null, { pageSize: 500, maxPages: 1 });
}, 90_000);

afterAll(async () => {
  if (prisma && fixtureOwnershipEstablished) await cleanUp();

  delete process.env.REGISTRY_LOCAL_FILE;
  await app?.close();
});

describe('Загрузка реестра', () => {
  it('сообщает, что источник настоящий', () => {
    expect(result.source).toEqual({
      code: 'roszdravnadzor-registry',
      isReal: true,
    });
  });

  it('создаёт изделия из записей реестра', async () => {
    const count = await prisma.product.count({
      where: { registrationNumber: { in: FIXTURE_NUMBERS } },
    });

    // Seven raw rows: five imported, one malformed and one unknown status.
    expect(result.recordsRead).toBe(7);
    expect(result.rejected).toBe(1);
    expect(result.complete).toBe(true);
    expect(result.analyticsRefreshed).toBe(true);
    expect(count).toBe(5);
  });

  it('пропускает запись с неизвестным статусом и объясняет причину', async () => {
    // Выдумывать статус нельзя: справочник описывает смысл, а не строку.
    expect(result.skipped).toBe(2);
    expect(result.status).toBe('partial');

    const errors = await prisma.syncRunError.findMany({
      where: { syncRunId: result.runId, errorCode: 'ENTRY_IMPORT_FAILED' },
      select: { externalRecordId: true, message: true },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.externalRecordId).toContain('ФС 99999/0002-26');
    expect(errors[0]?.message).toContain('some_new_status');

    const skipped = await prisma.product.findUnique({
      where: { registrationNumber: 'ФС 99999/0002-26' },
      select: { id: true },
    });
    expect(skipped).toBeNull();
  });

  it('сохраняет числа источника, а не только загруженное', () => {
    // totalElements нужен интерфейсу, чтобы показать охват загрузки.
    expect(result.totalInRegistry).toBe(7);
  });

  it('переносит поля записи без домыслов', async () => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { registrationNumber: 'ФС 022а1307/0383-04' },
      select: {
        name: true,
        externalRegistryId: true,
        frnsiId: true,
        legalSystem: true,
        registrationDate: true,
        registrationExpiresAt: true,
        categoryId: true,
        riskClassId: true,
        originTypeId: true,
        manufacturer: { select: { name: true, actualAddress: true, countryId: true } },
        currentRegistryStatus: { select: { code: true } },
      },
    });

    expect(product.externalRegistryId).toBe(42305);
    expect(product.frnsiId).toBe('o26333');
    expect(product.legalSystem).toBe('RUSSIA');
    expect(product.registrationDate?.toISOString()).toContain('2004-08-04');
    expect(product.registrationExpiresAt?.toISOString()).toContain('2013-08-04');
    expect(product.currentRegistryStatus.code).toBe('expired');
    expect(product.manufacturer.name).toBe('ООО НПП "ВЕНД"');
    expect(product.manufacturer.actualAddress).toBe('Саратов');

    // Реестр не даёт ни категории, ни происхождения, ни класса риска, ни
    // страны производителя: эти поля остаются пустыми, а не выдуманными.
    expect(product.categoryId).toBeNull();
    expect(product.riskClassId).toBeNull();
    expect(product.originTypeId).toBeNull();
    expect(product.manufacturer.countryId).toBeNull();
  });

  it('заводит каждое изделие с событием истории статуса', async () => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { registrationNumber: 'ФС 012а2004/0344-04' },
      select: {
        currentRegistryStatusId: true,
        statusHistory: {
          select: { registryStatusId: true, sourceRunId: true, comment: true },
        },
      },
    });

    // Статус изделия без события истории — это потерянный след загрузки.
    expect(product.statusHistory).toHaveLength(1);
    expect(product.statusHistory[0]?.registryStatusId).toBe(
      product.currentRegistryStatusId,
    );
    expect(product.statusHistory[0]?.sourceRunId).toBe(result.runId);
    expect(product.statusHistory[0]?.comment).toContain('Срок действия истек');
  });

  it('сохраняет аномальные даты как в источнике и помечает их в журнале', async () => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { registrationNumber: 'ФС 01012002/9999-06' },
      select: { registrationDate: true, registrationExpiresAt: true },
    });

    // Срок действия раньше даты регистрации: так опубликовано в реестре.
    expect(product.registrationDate?.toISOString()).toContain('2006-02-07');
    expect(product.registrationExpiresAt?.toISOString()).toContain('2000-02-07');

    const anomalies = await prisma.syncRunError.findMany({
      where: { syncRunId: result.runId, errorCode: 'REGISTRY_DATE_ANOMALY' },
      select: { externalRecordId: true },
    });

    // Молча «исправленная» дата была бы искажением государственного реестра.
    expect(anomalies.map((row) => row.externalRecordId)).toEqual([
      'ФС 01012002/9999-06',
    ]);
  });

  it('знает все пять статусов источника, включая «Недействительно»', async () => {
    // Код `invalid` не попал в первые проверенные выборки, и на полной
    // загрузке под него ушло около 12 % записей — 9 796 штук. Отображение
    // выведено из полного обхода реестра, поэтому закреплено тестом.
    const product = await prisma.product.findUniqueOrThrow({
      where: { registrationNumber: 'ФС 99999/0003-26' },
      select: { currentRegistryStatus: { select: { code: true, name: true } } },
    });

    expect(product.currentRegistryStatus).toMatchObject({
      code: 'invalid',
      name: 'Недействительно',
    });
  });

  it('не выдумывает производителя, когда его нет в записи', async () => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { registrationNumber: 'ФС 99999/0001-26' },
      select: { manufacturer: { select: { name: true, actualAddress: true } } },
    });

    expect(product.manufacturer.name).toBe('Производитель не указан');
    expect(product.manufacturer.actualAddress).toBeNull();
  });

  it('повторная загрузка обновляет записи, а не дублирует их', async () => {
    const second = await sync.run(null, { pageSize: 500, maxPages: 1 });

    expect(second.productsCreated).toBe(0);
    expect(second.productsUpdated).toBe(5);
    // Статусы не менялись, значит новых событий истории быть не должно.
    expect(second.statusChanges).toBe(0);

    const history = await prisma.registryStatusHistory.count({
      where: { product: { registrationNumber: { in: FIXTURE_NUMBERS } } },
    });
    expect(history).toBe(5);

    const manufacturers = await prisma.manufacturer.count({
      where: { name: { in: FIXTURE_MANUFACTURERS } },
    });
    expect(manufacturers).toBe(5);
  });

  it('смена статуса в реестре добавляет событие истории', async () => {
    // Статус подменяется так, будто в реестре он был другим: следующая
    // загрузка обязана вернуть значение источника и оставить след в истории.
    const other = await prisma.registryStatus.findUniqueOrThrow({
      where: { code: 'active' },
      select: { id: true },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { registrationNumber: 'ФС 012а2004/0344-04' },
      select: { id: true, currentRegistryStatusId: true },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { currentRegistryStatusId: other.id },
    });

    const third = await sync.run(null, { pageSize: 500, maxPages: 1 });

    expect(third.statusChanges).toBe(1);

    const updated = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: {
        currentRegistryStatusId: true,
        statusHistory: {
          orderBy: { effectiveAt: 'desc' },
          select: { registryStatusId: true, sourceRunId: true, comment: true },
        },
      },
    });

    // Статус вернулся к значению источника, и это зафиксировано событием.
    expect(updated.currentRegistryStatusId).toBe(product.currentRegistryStatusId);
    expect(updated.statusHistory).toHaveLength(2);
    expect(updated.statusHistory[0]).toMatchObject({
      registryStatusId: product.currentRegistryStatusId,
      sourceRunId: third.runId,
    });
    expect(updated.statusHistory[0]?.comment).toContain('Observed in registry');
  });
});

describe('Записи реестра в каталоге', () => {
  async function get(path: string) {
    const response = await app.inject({ method: 'GET', url: `/api/v1${path}` });
    return { status: response.statusCode, body: JSON.parse(response.body) };
  }

  it('запись реестра видна в каталоге, хотя у неё нет категории', async () => {
    // `product_catalog_view` соединял справочники внутренним JOIN, и записи
    // реестра — без категории, класса риска, происхождения и страны — из
    // каталога исчезали целиком. Загрузка 80 тысяч записей была бы при этом
    // бесполезной, поэтому поведение закреплено тестом.
    const result = await get(
      `/products?search=${encodeURIComponent('ФС 022а1307/0383-04')}`,
    );

    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].registrationNumber).toBe('ФС 022а1307/0383-04');
  });

  it('карточка записи реестра отдаёт пустые справочные поля, а не падает', async () => {
    const list = await get(
      `/products?search=${encodeURIComponent('ФС 022а1307/0383-04')}`,
    );
    const result = await get(`/products/${list.body.data[0].id}`);

    expect(result.status).toBe(200);
    expect(result.body.data.manufacturer.name).toBe('ООО НПП "ВЕНД"');
    // Чего в реестре нет, то приходит пустым, а не выдуманным значением.
    expect(result.body.data.category).toBeNull();
    expect(result.body.data.riskClass).toBeNull();
  });

  it('производитель из реестра попадает в справочник фильтров без страны', async () => {
    // Список производителей соединялся со странами внутренним JOIN, и
    // производители реестра — у которых страны нет — в фильтр не попадали.
    const result = await get('/catalog/filters');
    const manufacturers = result.body.data.manufacturers as {
      name: string;
      country: string | null;
    }[];

    const fromRegistry = manufacturers.find((row) => row.name === 'ООО НПП "ВЕНД"');

    expect(fromRegistry).toBeDefined();
    expect(fromRegistry?.country).toBeNull();
  });

  it('все загруженные записи попадают в каталог', async () => {
    const total = await prisma.product.count({
      where: { registrationNumber: { in: FIXTURE_NUMBERS } },
    });

    const inCatalog = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM product_catalog_view
       WHERE registration_number = ANY(${FIXTURE_NUMBERS})
    `;

    expect(Number(inCatalog[0]?.count ?? 0)).toBe(total);
  });
});

describe('Запуск загрузки через API', () => {
  async function tokenFor(email: string): Promise<string> {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email,
        password: process.env.SEED_DEV_PASSWORD ?? 'DevOnly-Seed-Password-2026',
      },
    });

    return JSON.parse(login.body).data.accessToken;
  }

  it('требует роль government', async () => {
    const token = await tokenFor('user@medizdeliya.local');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/government/sync/registry/run',
      headers: { authorization: `Bearer ${token}` },
      payload: { maxPages: 1 },
    });

    expect(response.statusCode).toBe(403);
  });

  it('отвергает maxPages вне допустимого диапазона', async () => {
    const token = await tokenFor('gov@medizdeliya.local');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/government/sync/registry/run',
      headers: { authorization: `Bearer ${token}` },
      payload: { maxPages: 0 },
    });

    expect(response.statusCode).toBe(422);
  });

  it('журнал показывает реестр как настоящий источник', async () => {
    const token = await tokenFor('gov@medizdeliya.local');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/government/sync',
      headers: { authorization: `Bearer ${token}` },
    });

    const sources = JSON.parse(response.body).data.sources as {
      code: string;
      isReal: boolean;
    }[];

    expect(sources.find((source) => source.code === 'mock-registry')?.isReal).toBe(
      false,
    );
    expect(
      sources.find((source) => source.code === 'roszdravnadzor-registry')?.isReal,
    ).toBe(true);
  });
});

describe('Обращение к настоящему реестру', () => {
  // Включается переменной: источнику нужен корень национального УЦ, которого
  // в CI нет, и CI не должен падать из-за недоступности сайта.
  const enabled = process.env.REGISTRY_NETWORK_TEST === 'true';

  it.skipIf(!enabled)(
    'читает страницу государственного реестра из сети',
    async () => {
      // Провайдер приложения настроен на фикстуру, и убрать её через
      // process.env нельзя: ConfigModule поднят с cache: true и отдаёт
      // значения, провалидированные при старте. Поэтому для сети берётся
      // отдельный экземпляр с пустыми настройками — он пойдёт на адрес по
      // умолчанию.
      const network = new RoszdravnadzorRegistryProvider({
        get: () => undefined,
      } as unknown as ConfigService);

      const page = await network.fetchPage(0, 10);

      // В реестре десятки тысяч записей; точное число меняется постоянно.
      expect(page.totalElements).toBeGreaterThan(50_000);
      expect(page.entries).toHaveLength(10);
      expect(page.entries[0]?.registrationNumber).toBeTruthy();
      expect(page.entries[0]?.name).toBeTruthy();
    },
    60_000,
  );
});


describe('Registry identity, locking and observation integration', () => {
  async function withEntry(entry: RegistryEntry, action: () => Promise<void>) {
    const provider = app.get(RoszdravnadzorRegistryProvider);
    const spy = vi.spyOn(provider, 'iterate').mockImplementation(async function* () {
      yield { entries: [entry], rawCount: 1, rejected: [], page: 0, totalPages: 1,
        totalElements: 1, last: true } satisfies RegistryPage;
    });
    try { await action(); } finally { spy.mockRestore(); }
  }
  async function firstEntry() {
    const page = await app.get(RoszdravnadzorRegistryProvider).fetchPage(0);
    return page.entries[0]!;
  }
  it('preserves the product id when the source corrects its registration number', async () => {
    const entry = await firstEntry();
    const before = await prisma.product.findUniqueOrThrow({ where: { externalRegistryId: entry.externalId } });
    try {
      await withEntry({ ...entry, registrationNumber: 'REGISTRY-TEST-CORRECTED' }, async () => {
        const result = await sync.run(null);
        expect(result).toMatchObject({ productsCreated: 0, productsUpdated: 1, skipped: 0 });
        const after = await prisma.product.findUniqueOrThrow({ where: { externalRegistryId: entry.externalId } });
        expect(after.id).toBe(before.id);
        expect(after.registrationNumber).toBe('REGISTRY-TEST-CORRECTED');
      });
    } finally {
      await prisma.product.update({ where: { id: before.id }, data: { registrationNumber: entry.registrationNumber } });
    }
  });
  it('records explicit conflicts without adopting another source identity', async () => {
    const entry = await firstEntry();
    const before = await prisma.product.findUniqueOrThrow({ where: { externalRegistryId: entry.externalId } });
    await withEntry({ ...entry, externalId: 99999001, name: 'Should not overwrite' }, async () => {
      const result = await sync.run(null);
      expect(result).toMatchObject({ skipped: 1, productsCreated: 0, productsUpdated: 0 });
      const after = await prisma.product.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.name).toBe(before.name);
      expect(after.externalRegistryId).toBe(before.externalRegistryId);
      expect(await prisma.syncRunError.count({
        where: { syncRunId: result.runId, errorCode: 'IDENTITY_CONFLICT' },
      })).toBe(1);
    });
  });

  it('rolls back a newly created manufacturer when the product cannot be stored', async () => {
    const entry = await firstEntry();
    const producer = { name: 'REGISTRY-TEST-ROLLBACK', actualAddress: 'Rollback address' };
    await withEntry({ ...entry, externalId: 99999002, registrationNumber: 'REGISTRY-TEST-ROLLBACK',
      producer, frnsiId: 'x'.repeat(65) }, async () => {
      const result = await sync.run(null);
      expect(result).toMatchObject({ skipped: 1, productsCreated: 0, manufacturersCreated: 0 });
      expect(await prisma.manufacturer.count({ where: { name: producer.name } })).toBe(0);
      expect(await prisma.product.count({ where: { externalRegistryId: 99999002 } })).toBe(0);
    });
  });
  it('dates initial history at observation and refreshes derived analytics', async () => {
    const entry = await firstEntry();
    const product = await prisma.product.findUniqueOrThrow({
      where: { externalRegistryId: entry.externalId },
      include: { statusHistory: { orderBy: { effectiveAt: 'asc' } } },
    });
    const run = await prisma.syncRun.findUniqueOrThrow({
      where: { id: product.statusHistory[0]!.sourceRunId! },
    });
    expect(product.statusHistory[0]!.effectiveAt.getTime()).toBeGreaterThanOrEqual(run.startedAt.getTime());
    expect(product.verifiedAt!.getTime()).toBeGreaterThan(product.registrationDate!.getTime());
    const [cache] = await prisma.$queryRaw<{ total_products: number }[]>`SELECT total_products FROM domestic_share_by_period_view ORDER BY period_year DESC LIMIT 1`;
    expect(cache!.total_products).toBeGreaterThanOrEqual(5);
  });
  it('flags cancelled and invalid registrations as blocking', async () => {
    const rows = await prisma.$queryRaw<{ registry_status_code: string; status_blocking: boolean }[]>`SELECT registry_status_code, status_blocking FROM problem_products_view
         WHERE registration_number IN ('ФС 99999/0001-26', 'ФС 99999/0003-26')`;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status_blocking)).toBe(true);
  });
  it('enforces unfinished-run uniqueness across two independent DB clients', async () => {
    const other = new PrismaClient();
    const source = await prisma.syncSource.findUniqueOrThrow({
      where: { code: RoszdravnadzorRegistryProvider.CODE },
    });
    const running = await prisma.syncRunStatus.findUniqueOrThrow({ where: { code: 'running' } });
    const data = { syncSourceId: source.id, statusId: running.id };
    const ownedIds: string[] = [];
    try {
      const attempts = await Promise.allSettled([
        prisma.syncRun.create({ data }), other.syncRun.create({ data }),
      ]);
      for (const attempt of attempts) if (attempt.status === 'fulfilled') ownedIds.push(attempt.value.id);
      expect(ownedIds).toHaveLength(1);
      const rejected = attempts.find((attempt) => attempt.status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason.code).toBe('P2002');
      await expect(sync.run(null)).rejects.toThrow('unfinished import');
    } finally {
      await prisma.syncRun.deleteMany({ where: { id: { in: ownedIds } } });
      await other.$disconnect();
    }
  });
});

/**
 * Интеграционные тесты государственного раздела и кабинета организации.
 *
 * Отдельно проверяется, что демонстрационный источник нигде не выдаёт себя за
 * подключённый внешний реестр (ADR 0008), и что аналитические показатели
 * совпадают с seed-данными.
 *
 * Тесты запуска загрузки меняют статусы изделий и историю, поэтому в конце
 * исходное состояние восстанавливается.
 */

import fastifyCookie from '@fastify/cookie';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = process.env.SEED_DEV_PASSWORD ?? 'DevOnly-Seed-Password-2026';

let app: NestFastifyApplication;
let prisma: PrismaService;
const createdEmails: string[] = [];

let governmentToken: string;
let clinicToken: string;
let plainUserToken: string;

/** Снимок статусов изделий до тестов запуска загрузки. */
let statusSnapshot: { id: string; currentRegistryStatusId: string }[] = [];
let historyIdsBefore: string[] = [];
let syncRunIdsBefore: string[] = [];

interface Result {
  status: number;
  body: any;
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { body?: Record<string, unknown>; token?: string } = {},
): Promise<Result> {
  const response = await app.inject({
    method,
    url: `/api/v1${path}`,
    ...(options.body !== undefined ? { payload: options.body } : {}),
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
  });

  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : undefined,
  };
}

async function loginSeed(email: string): Promise<string> {
  const result = await call('POST', '/auth/login', {
    body: { email, password: SEED_PASSWORD },
  });
  if (result.status !== 200) {
    throw new Error(`Вход ${email} не удался: ${JSON.stringify(result.body)}`);
  }
  return result.body.data.accessToken;
}

async function newUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  createdEmails.push(email);

  const result = await call('POST', '/auth/register', {
    body: { email, password: 'VeryLongPassword1', displayName: 'Тест' },
  });
  return result.body.data.accessToken;
}

beforeAll(async () => {
  process.env.THROTTLE_DISABLED = 'true';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);

  governmentToken = await loginSeed('gov@medizdeliya.local');
  clinicToken = await loginSeed('clinic@medizdeliya.local');
  plainUserToken = await loginSeed('user@medizdeliya.local');

  statusSnapshot = await prisma.product.findMany({
    select: { id: true, currentRegistryStatusId: true },
  });
  historyIdsBefore = (
    await prisma.registryStatusHistory.findMany({ select: { id: true } })
  ).map((row) => row.id);
  syncRunIdsBefore = (await prisma.syncRun.findMany({ select: { id: true } })).map(
    (row) => row.id,
  );
}, 60_000);

afterAll(async () => {
  if (prisma) {
    // Восстанавливаем статусы и убираем историю, добавленную тестами.
    for (const product of statusSnapshot) {
      await prisma.product.update({
        where: { id: product.id },
        data: { currentRegistryStatusId: product.currentRegistryStatusId },
      });
    }
    await prisma.registryStatusHistory.deleteMany({
      where: { id: { notIn: historyIdsBefore } },
    });
    // Запуски, созданные тестами, вместе с их ошибками (каскад). Удаляются
    // строго те, которых не было до прогона: сравнение по снимку id, а не по
    // времени, чтобы seed-запуски остались на месте.
    await prisma.syncRun.deleteMany({
      where: { id: { notIn: syncRunIdsBefore } },
    });

    if (createdEmails.length > 0) {
      const users = await prisma.user.findMany({
        where: { email: { in: createdEmails } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      await prisma.review.deleteMany({ where: { authorUserId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    await prisma.refreshAnalyticsViews(false);
  }

  await app?.close();
});

describe('GET /government/analytics', () => {
  it('возвращает показатели, совпадающие с seed-данными', async () => {
    const result = await call('GET', '/government/analytics', {
      token: governmentToken,
    });

    expect(result.status).toBe(200);
    const data = result.body.data;

    // Три отечественных изделия из четырёх.
    expect(data.domesticShare).toBe(75);
    expect(data.totalProducts).toBe(4);
    expect(data.domesticProducts).toBe(3);

    // Доля импорта в «Диагностике» — одно изделие из четырёх.
    const diagnostics = data.dependencies.find(
      (row: { categorySlug: string }) => row.categorySlug === 'diagnostics',
    );
    expect(diagnostics.value).toBe(25);
    expect(diagnostics.totalProducts).toBe(4);
    expect(diagnostics.importedProducts).toBe(1);
  });

  it('сообщает время обновления кэша', async () => {
    const result = await call('GET', '/government/analytics', {
      token: governmentToken,
    });

    // ADR 0006: аналитика читается из materialized views и может отставать,
    // поэтому клиент получает время последнего обновления.
    expect(result.body.data.refreshedAt).toBeTypeOf('string');
    expect(Number.isNaN(Date.parse(result.body.data.refreshedAt))).toBe(false);
  });

  it('динамика идёт по возрастанию лет', async () => {
    const result = await call('GET', '/government/analytics', {
      token: governmentToken,
    });
    const years = result.body.data.importSubstitution.map(
      (row: { year: string }) => Number(row.year),
    );

    expect(years.length).toBeGreaterThan(1);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('фильтр period отсекает ранние годы', async () => {
    const all = await call('GET', '/government/analytics', { token: governmentToken });
    const filtered = await call('GET', '/government/analytics?period=2024', {
      token: governmentToken,
    });

    expect(filtered.body.data.importSubstitution.length).toBeLessThan(
      all.body.data.importSubstitution.length,
    );
    expect(
      filtered.body.data.importSubstitution.every(
        (row: { year: string }) => Number(row.year) >= 2024,
      ),
    ).toBe(true);
  });

  it('фильтр categoryId оставляет одну категорию', async () => {
    const filters = await call('GET', '/catalog/filters');
    const diagnostics = filters.body.data.categories.find(
      (category: { slug: string }) => category.slug === 'diagnostics',
    );

    const result = await call(
      `GET`,
      `/government/analytics?categoryId=${diagnostics.id}`,
      { token: governmentToken },
    );

    expect(result.body.data.dependencies).toHaveLength(1);
    expect(result.body.data.dependencies[0].categorySlug).toBe('diagnostics');
  });

  it('отклоняет некорректный период', async () => {
    const result = await call('GET', '/government/analytics?period=вчера', {
      token: governmentToken,
    });

    expect(result.status).toBe(422);
  });

  it('требует роль government', async () => {
    expect((await call('GET', '/government/analytics')).status).toBe(401);
    expect(
      (await call('GET', '/government/analytics', { token: plainUserToken })).status,
    ).toBe(403);
    expect(
      (await call('GET', '/government/analytics', { token: clinicToken })).status,
    ).toBe(403);
  });
});

describe('GET /government/problem-products', () => {
  it('находит изделие с истекающей регистрацией и критическим отзывом', async () => {
    const result = await call('GET', '/government/problem-products', {
      token: governmentToken,
    });

    expect(result.status).toBe(200);

    const mitar = result.body.data.find((item: { name: string }) =>
      item.name.includes('МИТАР-01'),
    );
    expect(mitar).toBeDefined();
    expect(mitar.reasons.registrationExpiring).toBe(true);
    expect(mitar.reasons.criticalReviews).toBe(true);
    expect(mitar.criticalReviewCount).toBe(1);
  });

  it('требует роль government', async () => {
    expect(
      (await call('GET', '/government/problem-products', { token: plainUserToken }))
        .status,
    ).toBe(403);
  });
});

describe('GET /government/sync', () => {
  it('сообщает, что внешний реестр не подключён', async () => {
    const result = await call('GET', '/government/sync', { token: governmentToken });

    expect(result.status).toBe(200);
    // Главное требование ADR 0008.
    expect(result.body.data.source.isReal).toBe(false);
    expect(result.body.data.source.code).toBe('mock-registry');
    // URL внешнего источника не указан, потому что источника нет.
    expect(result.body.data.source.baseUrl).toBeNull();
  });

  it('возвращает журнал запусков из seed', async () => {
    const result = await call('GET', '/government/sync', { token: governmentToken });
    const statuses = result.body.data.runs.map((run: { status: string }) => run.status);

    // Seed содержит успешные, частичный и упавший запуски.
    expect(statuses).toContain('success');
    expect(statuses).toContain('partial');
    expect(statuses).toContain('failed');
  });

  it('выводит состояние из журнала, а не хранит его', async () => {
    const result = await call('GET', '/government/sync', { token: governmentToken });

    // Последняя успешная загрузка в seed датирована прошлым, поэтому данные
    // считаются устаревшими.
    expect(['current', 'stale', 'error', 'empty']).toContain(result.body.data.state);
    expect(result.body.data.lastUpdatedAt).toBeTypeOf('string');
  });

  it('отдаёт ошибки конкретного запуска', async () => {
    const list = await call('GET', '/government/sync', { token: governmentToken });
    const failed = list.body.data.runs.find(
      (run: { status: string }) => run.status === 'failed',
    );

    const result = await call(`GET`, `/government/sync/runs/${failed.id}/errors`, {
      token: governmentToken,
    });

    expect(result.status).toBe(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(result.body.data[0].errorCode).toBeTypeOf('string');
  });

  it('требует роль government', async () => {
    expect((await call('GET', '/government/sync', { token: clinicToken })).status).toBe(403);
  });
});

describe('POST /government/sync/run', () => {
  it('запускает загрузку и не выдаёт её за реальное API', async () => {
    const result = await call('POST', '/government/sync/run', {
      token: governmentToken,
      body: { scenario: 'success' },
    });

    expect(result.status).toBe(201);
    expect(result.body.data.status).toBe('success');
    expect(result.body.data.recordsRead).toBe(4);
    // Ответ на каждый запуск помечает источник как демонстрационный.
    expect(result.body.data.source.isReal).toBe(false);
  });

  it('сценарий partial даёт частичный статус и запись об ошибке', async () => {
    const result = await call('POST', '/government/sync/run', {
      token: governmentToken,
      body: { scenario: 'partial' },
    });

    expect(result.body.data.status).toBe('partial');
    expect(result.body.data.errorCount).toBe(1);

    const errors = await call(
      `GET`,
      `/government/sync/runs/${result.body.data.runId}/errors`,
      { token: governmentToken },
    );
    expect(errors.body.data).toHaveLength(1);
    expect(errors.body.data[0].errorCode).toBe('CHECKSUM_MISMATCH');
  });

  it('сценарий failed фиксируется в журнале', async () => {
    const result = await call('POST', '/government/sync/run', {
      token: governmentToken,
      body: { scenario: 'failed' },
    });

    expect(result.body.data.status).toBe('failed');
    expect(result.body.data.recordsRead).toBe(0);

    const status = await call('GET', '/government/sync', { token: governmentToken });
    expect(status.body.data.state).toBe('error');
  });

  it('истёкшая регистрация переводит изделие в expired и пишет событие истории', async () => {
    const historyBefore = await prisma.registryStatusHistory.count();

    // MockRegistryProvider не выдумывает данные: он возвращает текущий статус
    // изделия и меняет его единственным проверяемым правилом — истёкший срок
    // регистрации даёт статус expired. Поэтому для проверки сдвигаем срок в
    // прошлое, а не статус.
    const product = await prisma.product.findFirstOrThrow({
      where: { registrationNumber: 'РЗН 2023/19704' },
      select: { id: true, registrationExpiresAt: true, currentRegistryStatusId: true },
    });
    const originalExpiry = product.registrationExpiresAt;

    await prisma.product.update({
      where: { id: product.id },
      data: { registrationExpiresAt: new Date('2026-01-15T00:00:00.000Z') },
    });

    try {
      const result = await call('POST', '/government/sync/run', {
        token: governmentToken,
        body: { scenario: 'success' },
      });

      expect(result.body.data.recordsChanged).toBeGreaterThan(0);

      // Текущий статус изделия обновился.
      const updated = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { currentRegistryStatus: { select: { code: true } } },
      });
      expect(updated.currentRegistryStatus.code).toBe('expired');

      // История не перезаписана, а дополнена новым событием со ссылкой на запуск.
      const historyAfter = await prisma.registryStatusHistory.count();
      expect(historyAfter).toBeGreaterThan(historyBefore);

      const event = await prisma.registryStatusHistory.findFirst({
        where: { sourceRunId: result.body.data.runId, productId: product.id },
        select: { registryStatus: { select: { code: true } } },
      });
      expect(event?.registryStatus.code).toBe('expired');

      // Прежние события этого изделия на месте.
      const ownHistory = await prisma.registryStatusHistory.count({
        where: { productId: product.id },
      });
      expect(ownHistory).toBeGreaterThan(1);
    } finally {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          registrationExpiresAt: originalExpiry,
          currentRegistryStatusId: product.currentRegistryStatusId,
        },
      });
    }
  });

  it('повторная загрузка без изменений не добавляет событий в историю', async () => {
    // Первый запуск приводит статусы в соответствие с источником.
    await call('POST', '/government/sync/run', {
      token: governmentToken,
      body: { scenario: 'success' },
    });

    const historyBefore = await prisma.registryStatusHistory.count();

    const second = await call('POST', '/government/sync/run', {
      token: governmentToken,
      body: { scenario: 'success' },
    });

    // Запись без смены статуса события не создаёт: иначе история росла бы на
    // каждую загрузку, не сообщая ничего нового.
    expect(second.body.data.recordsChanged).toBe(0);
    expect(await prisma.registryStatusHistory.count()).toBe(historyBefore);
  });

  it('отклоняет неизвестный сценарий', async () => {
    const result = await call('POST', '/government/sync/run', {
      token: governmentToken,
      body: { scenario: 'катастрофа' },
    });

    expect(result.status).toBe(422);
  });

  it('требует роль government', async () => {
    expect(
      (await call('POST', '/government/sync/run', { token: plainUserToken, body: {} }))
        .status,
    ).toBe(403);
  });
});

describe('Кабинет организации', () => {
  it('возвращает сводку со счётчиками из представления', async () => {
    const result = await call('GET', '/organization/dashboard', {
      token: clinicToken,
    });

    expect(result.status).toBe(200);
    const data = result.body.data;

    expect(data.organization.verified).toBe(true);
    expect(data.organization.verificationStatus).toBe('verified');
    // Согласно seed: два сохранённых изделия и три непрочитанных уведомления.
    expect(data.counters.savedProducts).toBe(2);
    expect(data.counters.unreadNotifications).toBe(3);
    expect(data.counters.reviews).toBe(2);
    expect(data.savedProducts).toHaveLength(2);
  });

  it('отдаёт сотрудников организации', async () => {
    const result = await call('GET', '/organization/members', { token: clinicToken });

    expect(result.status).toBe(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(result.body.data[0].role.code).toBe('administrator');
    expect(result.body.data[0].verified).toBe(true);
  });

  it('уведомления и отметка прочтения работают', async () => {
    const list = await call('GET', '/organization/notifications?unreadOnly=true', {
      token: clinicToken,
    });
    expect(list.body.data.length).toBeGreaterThan(0);

    const target = list.body.data[0];
    const marked = await call(
      'PATCH',
      `/organization/notifications/${target.id}/read`,
      { token: clinicToken },
    );

    expect(marked.status).toBe(200);
    expect(marked.body.data.read).toBe(true);

    // Возвращаем исходное состояние, чтобы не ломать остальные ожидания.
    const clinic = await prisma.user.findUniqueOrThrow({
      where: { email: 'clinic@medizdeliya.local' },
      select: { id: true },
    });
    await prisma.notificationRecipient.update({
      where: { notificationId_userId: { notificationId: target.id, userId: clinic.id } },
      data: { readAt: null },
    });
  });

  it('требует роль organization', async () => {
    expect((await call('GET', '/organization/dashboard')).status).toBe(401);
    expect(
      (await call('GET', '/organization/dashboard', { token: plainUserToken })).status,
    ).toBe(403);
  });

  it('пользователь без организации получает 403', async () => {
    const token = await newUser('org-less');

    const result = await call('GET', '/organization/dashboard', { token });
    expect(result.status).toBe(403);
  });

  it('нельзя запросить кабинет чужой организации', async () => {
    const stranger = await prisma.organization.findFirstOrThrow({
      where: { organizationType: { code: 'supplier' } },
      select: { id: true },
    });

    const result = await call(
      `GET`,
      `/organization/dashboard?organizationId=${stranger.id}`,
      { token: clinicToken },
    );

    expect(result.status).toBe(403);
    expect(result.body.type).toContain('not-organization-member');
  });
});

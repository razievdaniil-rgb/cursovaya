/**
 * Интеграционные тесты сохранённых списков, сравнений и уведомлений.
 *
 * Отдельно проверяется ограничение «не более трёх изделий в сравнении», в том
 * числе при конкурентных запросах: именно этот сценарий требует транзакции с
 * блокировкой строки сравнения.
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
let allProductIds: string[] = [];

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

async function newUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  createdEmails.push(email);

  const result = await call('POST', '/auth/register', {
    body: { email, password: 'VeryLongPassword1', displayName: 'Тест' },
  });
  if (result.status !== 201) {
    throw new Error(`Регистрация ${email} не удалась: ${JSON.stringify(result.body)}`);
  }

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

  const products = await call('GET', '/products');
  allProductIds = products.body.data.map((product: { id: string }) => product.id);
}, 60_000);

afterAll(async () => {
  if (prisma && createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await app?.close();
});

describe('Сохранённые списки', () => {
  it('создаёт, читает, переименовывает и удаляет список', async () => {
    const token = await newUser('saved-crud');

    const created = await call('POST', '/saved-lists', {
      token,
      body: { name: 'Закупка 2027' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('Закупка 2027');
    expect(created.body.data.productCount).toBe(0);

    const listId = created.body.data.id;

    const read = await call('GET', `/saved-lists/${listId}`, { token });
    expect(read.status).toBe(200);
    expect(read.body.data.id).toBe(listId);

    const renamed = await call('PATCH', `/saved-lists/${listId}`, {
      token,
      body: { name: 'Закупка 2028' },
    });
    expect(renamed.body.data.name).toBe('Закупка 2028');

    expect((await call('DELETE', `/saved-lists/${listId}`, { token })).status).toBe(204);
    expect((await call('GET', `/saved-lists/${listId}`, { token })).status).toBe(404);
  });

  it('добавляет и убирает изделия, отдавая актуальные карточки', async () => {
    const token = await newUser('saved-items');
    const created = await call('POST', '/saved-lists', {
      token,
      body: { name: 'Мониторы' },
    });
    const listId = created.body.data.id;

    const added = await call(
      'POST',
      `/saved-lists/${listId}/products/${allProductIds[0]}`,
      { token },
    );
    expect(added.status).toBe(201);
    expect(added.body.data.productCount).toBe(1);
    // Карточка приходит из каталожного представления с ценой и рейтингом.
    expect(added.body.data.items[0].product.price).toBeTypeOf('object');
    expect(added.body.data.items[0].product.rating).toBeTypeOf('object');

    const removed = await call(
      'DELETE',
      `/saved-lists/${listId}/products/${allProductIds[0]}`,
      { token },
    );
    expect(removed.body.data.productCount).toBe(0);
  });

  it('не допускает дубликатов', async () => {
    const token = await newUser('saved-dup');
    const created = await call('POST', '/saved-lists', { token, body: { name: 'Дубли' } });
    const listId = created.body.data.id;

    await call('POST', `/saved-lists/${listId}/products/${allProductIds[0]}`, { token });
    const second = await call(
      'POST',
      `/saved-lists/${listId}/products/${allProductIds[0]}`,
      { token },
    );

    expect(second.status).toBe(409);
    expect(second.body.type).toContain('already-in-collection');
  });

  it('в списке может быть сколько угодно изделий', async () => {
    const token = await newUser('saved-many');
    const created = await call('POST', '/saved-lists', { token, body: { name: 'Все' } });
    const listId = created.body.data.id;

    for (const productId of allProductIds) {
      const result = await call(
        'POST',
        `/saved-lists/${listId}/products/${productId}`,
        { token },
      );
      expect(result.status).toBe(201);
    }

    const read = await call('GET', `/saved-lists/${listId}`, { token });
    expect(read.body.data.productCount).toBe(allProductIds.length);
  });

  it('не даёт доступа к чужому списку', async () => {
    const owner = await newUser('saved-owner');
    const stranger = await newUser('saved-stranger');

    const created = await call('POST', '/saved-lists', {
      token: owner,
      body: { name: 'Личный список' },
    });
    const listId = created.body.data.id;

    // Чужой список неотличим от несуществующего — 404, а не 403.
    expect((await call('GET', `/saved-lists/${listId}`, { token: stranger })).status).toBe(404);
    expect(
      (await call('PATCH', `/saved-lists/${listId}`, { token: stranger, body: { name: 'Взлом' } }))
        .status,
    ).toBe(404);
    expect((await call('DELETE', `/saved-lists/${listId}`, { token: stranger })).status).toBe(404);
    expect(
      (await call('POST', `/saved-lists/${listId}/products/${allProductIds[0]}`, { token: stranger }))
        .status,
    ).toBe(404);

    // Владелец по-прежнему видит список.
    expect((await call('GET', `/saved-lists/${listId}`, { token: owner })).status).toBe(200);
  });

  it('требует авторизацию', async () => {
    expect((await call('GET', '/saved-lists')).status).toBe(401);
    expect((await call('POST', '/saved-lists', { body: { name: 'Без входа' } })).status).toBe(401);
  });

  it('отдаёт 404 для неизвестного изделия', async () => {
    const token = await newUser('saved-404');
    const created = await call('POST', '/saved-lists', { token, body: { name: '404' } });

    const result = await call(
      'POST',
      `/saved-lists/${created.body.data.id}/products/00000000-0000-4000-8000-000000000000`,
      { token },
    );

    expect(result.status).toBe(404);
  });

  it('не позволяет привязать список к чужой организации', async () => {
    const token = await newUser('saved-org');
    const organization = await prisma.organization.findFirstOrThrow({
      where: { verificationStatus: { code: 'verified' } },
      select: { id: true },
    });

    const result = await call('POST', '/saved-lists', {
      token,
      body: { name: 'Чужая организация', organizationId: organization.id },
    });

    expect(result.status).toBe(403);
    expect(result.body.type).toContain('not-organization-member');
  });
});

describe('Сравнения', () => {
  it('создаёт сравнение и добавляет изделия с позициями 1..3', async () => {
    const token = await newUser('compare-basic');
    const created = await call('POST', '/comparisons', {
      token,
      body: { name: 'Мониторы' },
    });

    expect(created.status).toBe(201);
    expect(created.body.data.maxProducts).toBe(3);

    const comparisonId = created.body.data.id;

    for (const [index, productId] of allProductIds.slice(0, 3).entries()) {
      const result = await call(
        'POST',
        `/comparisons/${comparisonId}/products/${productId}`,
        { token },
      );
      expect(result.status).toBe(201);
      expect(result.body.data.productCount).toBe(index + 1);
    }

    const read = await call('GET', `/comparisons/${comparisonId}`, { token });
    expect(read.body.data.items.map((item: { position: number }) => item.position)).toEqual([
      1, 2, 3,
    ]);
  });

  it('отклоняет четвёртое изделие', async () => {
    const token = await newUser('compare-limit');
    const created = await call('POST', '/comparisons', { token, body: {} });
    const comparisonId = created.body.data.id;

    for (const productId of allProductIds.slice(0, 3)) {
      await call('POST', `/comparisons/${comparisonId}/products/${productId}`, { token });
    }

    const fourth = await call(
      'POST',
      `/comparisons/${comparisonId}/products/${allProductIds[3]}`,
      { token },
    );

    expect(fourth.status).toBe(409);
    expect(fourth.body.type).toContain('comparison-full');

    // В сравнении по-прежнему ровно три позиции.
    const read = await call('GET', `/comparisons/${comparisonId}`, { token });
    expect(read.body.data.productCount).toBe(3);
  });

  it('при конкурентных запросах лимит не превышается', async () => {
    const token = await newUser('compare-race');
    const created = await call('POST', '/comparisons', { token, body: {} });
    const comparisonId = created.body.data.id;

    // Четыре одновременных добавления в пустое сравнение: три должны пройти,
    // одно — получить 409. Без блокировки строки сравнения два запроса
    // выбрали бы одну позицию и один упал бы с 500 на UNIQUE.
    const results = await Promise.all(
      allProductIds.map((productId) =>
        call('POST', `/comparisons/${comparisonId}/products/${productId}`, { token }),
      ),
    );

    const created201 = results.filter((result) => result.status === 201);
    const conflicts = results.filter((result) => result.status === 409);
    const serverErrors = results.filter((result) => result.status >= 500);

    expect(serverErrors).toHaveLength(0);
    expect(created201).toHaveLength(3);
    expect(conflicts).toHaveLength(1);

    const read = await call('GET', `/comparisons/${comparisonId}`, { token });
    expect(read.body.data.productCount).toBe(3);

    // Позиции остались уникальными и в допустимом диапазоне.
    const positions = read.body.data.items.map((item: { position: number }) => item.position);
    expect(new Set(positions).size).toBe(3);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...positions)).toBeLessThanOrEqual(3);
  });

  it('освобождённая позиция переиспользуется', async () => {
    const token = await newUser('compare-reuse');
    const created = await call('POST', '/comparisons', { token, body: {} });
    const comparisonId = created.body.data.id;

    for (const productId of allProductIds.slice(0, 3)) {
      await call('POST', `/comparisons/${comparisonId}/products/${productId}`, { token });
    }

    // Убираем изделие со второй позиции.
    await call('DELETE', `/comparisons/${comparisonId}/products/${allProductIds[1]}`, {
      token,
    });

    const added = await call(
      'POST',
      `/comparisons/${comparisonId}/products/${allProductIds[3]}`,
      { token },
    );

    expect(added.status).toBe(201);
    const positions = added.body.data.items.map((item: { position: number }) => item.position);
    expect(positions.sort()).toEqual([1, 2, 3]);
  });

  it('строит матрицу сравнимых характеристик', async () => {
    const token = await newUser('compare-matrix');
    const created = await call('POST', '/comparisons', { token, body: {} });
    const comparisonId = created.body.data.id;

    for (const productId of allProductIds.slice(0, 2)) {
      await call('POST', `/comparisons/${comparisonId}/products/${productId}`, { token });
    }

    const read = await call('GET', `/comparisons/${comparisonId}`, { token });
    const matrix = read.body.data.comparableCharacteristics;

    expect(matrix.length).toBeGreaterThan(0);

    const ecg = matrix.find((row: { code: string }) => row.code === 'ecg_channels');
    expect(ecg.name).toBe('Каналы ЭКГ');
    expect(ecg.values).toHaveLength(2);
    // Значения типизированы — числа, а не строки из JSON.
    expect(ecg.values.every((value: { value: unknown }) => typeof value.value === 'number')).toBe(
      true,
    );
  });

  it('не допускает дубликатов', async () => {
    const token = await newUser('compare-dup');
    const created = await call('POST', '/comparisons', { token, body: {} });
    const comparisonId = created.body.data.id;

    await call('POST', `/comparisons/${comparisonId}/products/${allProductIds[0]}`, {
      token,
    });
    const second = await call(
      'POST',
      `/comparisons/${comparisonId}/products/${allProductIds[0]}`,
      { token },
    );

    expect(second.status).toBe(409);
    expect(second.body.type).toContain('already-in-collection');
  });

  it('не даёт доступа к чужому сравнению', async () => {
    const owner = await newUser('compare-owner');
    const stranger = await newUser('compare-stranger');

    const created = await call('POST', '/comparisons', { token: owner, body: {} });
    const comparisonId = created.body.data.id;

    expect((await call('GET', `/comparisons/${comparisonId}`, { token: stranger })).status).toBe(
      404,
    );
    expect(
      (await call('POST', `/comparisons/${comparisonId}/products/${allProductIds[0]}`, {
        token: stranger,
      })).status,
    ).toBe(404);
    expect((await call('DELETE', `/comparisons/${comparisonId}`, { token: stranger })).status).toBe(
      404,
    );
  });

  it('удаляет сравнение', async () => {
    const token = await newUser('compare-delete');
    const created = await call('POST', '/comparisons', { token, body: {} });
    const comparisonId = created.body.data.id;

    await call('POST', `/comparisons/${comparisonId}/products/${allProductIds[0]}`, {
      token,
    });

    expect((await call('DELETE', `/comparisons/${comparisonId}`, { token })).status).toBe(204);
    expect((await call('GET', `/comparisons/${comparisonId}`, { token })).status).toBe(404);
  });

  it('требует авторизацию', async () => {
    expect((await call('GET', '/comparisons')).status).toBe(401);
  });
});

describe('Уведомления', () => {
  it('отдаёт уведомления медорганизации из seed с числом непрочитанных', async () => {
    const login = await call('POST', '/auth/login', {
      body: { email: 'clinic@medizdeliya.local', password: SEED_PASSWORD },
    });
    const token = login.body.data.accessToken;

    const result = await call('GET', '/me/notifications', { token });

    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(4);
    // Три непрочитанных из четырёх — согласно seed.
    expect(result.body.meta.unreadCount).toBe(3);

    const first = result.body.data[0];
    expect(first.type.code).toBeTypeOf('string');
    expect(first.severity).toBeTypeOf('string');
  });

  it('фильтрует непрочитанные', async () => {
    const login = await call('POST', '/auth/login', {
      body: { email: 'clinic@medizdeliya.local', password: SEED_PASSWORD },
    });
    const token = login.body.data.accessToken;

    const result = await call('GET', '/me/notifications?unreadOnly=true', { token });

    expect(result.body.data).toHaveLength(3);
    expect(result.body.data.every((item: { read: boolean }) => item.read === false)).toBe(true);
  });

  it('у нового пользователя уведомлений нет', async () => {
    const token = await newUser('notifications-empty');

    const result = await call('GET', '/me/notifications', { token });

    expect(result.body.data).toEqual([]);
    expect(result.body.meta.unreadCount).toBe(0);
  });

  it('чужое уведомление отметить нельзя', async () => {
    const token = await newUser('notifications-stranger');
    const notification = await prisma.notification.findFirstOrThrow({
      select: { id: true },
    });

    const result = await call('PATCH', `/me/notifications/${notification.id}/read`, {
      token,
    });

    expect(result.status).toBe(404);
  });

  it('требует авторизацию', async () => {
    expect((await call('GET', '/me/notifications')).status).toBe(401);
  });
});

/**
 * Интеграционные тесты отзывов, модерации, списков, сравнений и уведомлений.
 *
 * Каждый тест создаёт собственного пользователя, поэтому ограничение
 * «один отзыв на изделие от пользователя» не мешает прогону, а seed-данные
 * остаются нетронутыми. Созданное удаляется в afterAll.
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

/** id изделий из seed, разложенные по короткому имени. */
const productIds = new Map<string, string>();

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

/** Регистрирует нового пользователя и возвращает его access token. */
async function newUser(prefix: string): Promise<{ token: string; email: string }> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  createdEmails.push(email);

  const result = await call('POST', '/auth/register', {
    body: { email, password: 'VeryLongPassword1', displayName: 'Тест' },
  });

  if (result.status !== 201) {
    throw new Error(`Не удалось зарегистрировать ${email}: ${JSON.stringify(result.body)}`);
  }

  return { token: result.body.data.accessToken, email };
}

async function loginSeed(email: string): Promise<string> {
  const result = await call('POST', '/auth/login', {
    body: { email, password: SEED_PASSWORD },
  });
  if (result.status !== 200) {
    throw new Error(`Не удалось войти как ${email}: ${JSON.stringify(result.body)}`);
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
  for (const product of products.body.data) {
    productIds.set(product.shortName, product.id);
  }
}, 60_000);

afterAll(async () => {
  if (prisma && createdEmails.length > 0) {
    // reviews.author_user_id объявлен с onDelete: Restrict — отзыв считается
    // содержимым каталога, а не личными данными, и не исчезает вместе с
    // учётной записью. Поэтому отзывы удаляются явно и до пользователей;
    // события модерации уходят каскадом вместе с отзывом.
    const users = await prisma.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    await prisma.review.deleteMany({ where: { authorUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await app?.close();
});

describe('POST /products/:id/reviews', () => {
  it('создаёт отзыв в статусе moderation', async () => {
    const { token } = await newUser('review');

    const result = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 5,
        title: 'Хороший монитор',
        body: 'Работает стабильно уже несколько месяцев, замечаний нет.',
        experience: 'over_6_months',
      },
    });

    expect(result.status).toBe(201);
    // Статус назначает сервер, а не клиент.
    expect(result.body.data.status).toBe('moderation');
    expect(result.body.data.publishedAt).toBeNull();
    expect(result.body.data.rating).toBe(5);
  });

  it('игнорирует попытку клиента задать статус и бейдж', async () => {
    const { token } = await newUser('review-forge');

    const result = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 5,
        title: 'Попытка подделки',
        body: 'Клиент пытается сразу опубликовать отзыв и получить бейдж.',
        experience: '1_to_6_months',
        status: 'published',
        verifiedOrganization: true,
        publishedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    expect(result.status).toBe(201);
    expect(result.body.data.status).toBe('moderation');
    expect(result.body.data.verifiedOrganization).toBe(false);
    expect(result.body.data.publishedAt).toBeNull();
  });

  it('требует авторизацию', async () => {
    const result = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      body: {
        rating: 4,
        title: 'Анонимный отзыв',
        body: 'Отзыв без авторизации не должен создаваться.',
        experience: '1_to_6_months',
      },
    });

    expect(result.status).toBe(401);
  });

  it('запрещает второй отзыв на то же изделие', async () => {
    const { token } = await newUser('review-dup');
    const body = {
      rating: 4,
      title: 'Первый отзыв',
      body: 'Первый отзыв этого пользователя на изделие.',
      experience: '1_to_6_months',
    };

    expect(
      (await call('POST', `/products/${productIds.get('Vismo')}/reviews`, { token, body }))
        .status,
    ).toBe(201);

    const second = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: { ...body, title: 'Второй отзыв' },
    });

    expect(second.status).toBe(409);
    expect(second.body.type).toContain('review-already-exists');
  });

  it('валидирует оценку и длину текста', async () => {
    const { token } = await newUser('review-validation');

    const badRating = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: { rating: 7, title: 'Оценка вне диапазона', body: 'Достаточно длинный текст.', experience: '1_to_6_months' },
    });
    expect(badRating.status).toBe(422);
    expect(badRating.body.errors.rating).toBeDefined();

    const shortBody = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: { rating: 4, title: 'Ок', body: 'коротко', experience: '1_to_6_months' },
    });
    expect(shortBody.status).toBe(422);
  });

  it('отклоняет неизвестный срок использования', async () => {
    const { token } = await newUser('review-exp');

    const result = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 4,
        title: 'Неизвестный срок',
        body: 'Срок использования отсутствует в справочнике.',
        experience: 'десять-лет',
      },
    });

    expect(result.status).toBe(422);
    expect(result.body.errors.experience).toBeDefined();
  });

  it('не даёт писать отзыв от имени чужой организации', async () => {
    const { token } = await newUser('review-org');
    const organization = await prisma.organization.findFirstOrThrow({
      where: { verificationStatus: { code: 'verified' } },
      select: { id: true },
    });

    const result = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 5,
        title: 'Чужая организация',
        body: 'Пользователь не состоит в указанной организации.',
        experience: '1_to_6_months',
        organizationId: organization.id,
      },
    });

    expect(result.status).toBe(403);
    expect(result.body.type).toContain('not-organization-member');
  });

  it('отдаёт 404 для неизвестного изделия', async () => {
    const { token } = await newUser('review-404');

    const result = await call(
      'POST',
      '/products/00000000-0000-4000-8000-000000000000/reviews',
      {
        token,
        body: {
          rating: 4,
          title: 'Изделия нет',
          body: 'Изделие с таким идентификатором отсутствует.',
          experience: '1_to_6_months',
        },
      },
    );

    expect(result.status).toBe(404);
  });

  it('новый отзыв не влияет на рейтинг до публикации', async () => {
    const vismoId = productIds.get('Vismo')!;
    const before = await call('GET', `/products/${vismoId}`);

    const { token } = await newUser('review-rating');
    await call('POST', `/products/${vismoId}/reviews`, {
      token,
      body: {
        rating: 1,
        title: 'Низкая оценка на модерации',
        body: 'Этот отзыв пока не опубликован и не должен менять рейтинг.',
        experience: 'under_1_month',
      },
    });

    const after = await call('GET', `/products/${vismoId}`);

    expect(after.body.data.rating.average).toBe(before.body.data.rating.average);
    expect(after.body.data.rating.reviewCount).toBe(before.body.data.rating.reviewCount);
  });
});

describe('GET /me/reviews', () => {
  it('показывает собственные отзывы вместе с находящимися на модерации', async () => {
    const { token } = await newUser('my-reviews');

    await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 4,
        title: 'Мой отзыв',
        body: 'Отзыв должен быть виден автору даже на модерации.',
        experience: '1_to_6_months',
      },
    });

    const result = await call('GET', '/me/reviews', { token });

    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].status).toBe('moderation');
  });

  it('не показывает отзывы других пользователей', async () => {
    const author = await newUser('my-reviews-author');
    const stranger = await newUser('my-reviews-stranger');

    await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token: author.token,
      body: {
        rating: 5,
        title: 'Отзыв автора',
        body: 'Этот отзыв не должен быть виден другому пользователю.',
        experience: '1_to_6_months',
      },
    });

    const result = await call('GET', '/me/reviews', { token: stranger.token });

    expect(result.body.data).toEqual([]);
  });

  it('требует авторизацию', async () => {
    expect((await call('GET', '/me/reviews')).status).toBe(401);
  });
});

describe('PATCH /admin/reviews/:id/status', () => {
  it('при двух одновременных публикациях пишет только одно событие', async () => {
    const { token } = await newUser('moderation-race');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token, body: { rating: 4, title: 'Параллельная модерация', body: 'Проверка последовательности одновременных публикаций отзыва.', experience: '1_to_6_months' },
    });
    const id = created.body.data.id;
    const adminToken = await loginSeed('admin@medizdeliya.local');
    const responses = await Promise.all([1, 2].map(() => call('PATCH', `/admin/reviews/${id}/status`, {
      token: adminToken, body: { status: 'published' },
    })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.reviewModerationEvent.count({ where: { reviewId: id } })).toBe(1);
  });
  it('публикует отзыв, проставляет дату и пишет событие модерации', async () => {
    const { token } = await newUser('moderate');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 5,
        title: 'К публикации',
        body: 'Отзыв, который модератор должен опубликовать.',
        experience: 'over_6_months',
      },
    });
    const reviewId = created.body.data.id;

    const adminToken = await loginSeed('admin@medizdeliya.local');
    const result = await call('PATCH', `/admin/reviews/${reviewId}/status`, {
      token: adminToken,
      body: { status: 'published', comment: 'Соответствует правилам' },
    });

    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe('published');
    expect(result.body.data.publishedAt).not.toBeNull();

    const history = await call('GET', `/admin/reviews/${reviewId}/history`, {
      token: adminToken,
    });
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({
      from: { code: 'moderation' },
      to: { code: 'published' },
      comment: 'Соответствует правилам',
    });
  });

  it('опубликованный отзыв попадает в рейтинг и в публичный список', async () => {
    const vismoId = productIds.get('Vismo')!;
    const { token } = await newUser('moderate-rating');

    const created = await call('POST', `/products/${vismoId}/reviews`, {
      token,
      body: {
        rating: 5,
        title: 'Отзыв для рейтинга',
        body: 'После публикации этот отзыв должен появиться в рейтинге.',
        experience: 'over_6_months',
      },
    });

    const before = await call('GET', `/products/${vismoId}`);
    const adminToken = await loginSeed('admin@medizdeliya.local');

    await call('PATCH', `/admin/reviews/${created.body.data.id}/status`, {
      token: adminToken,
      body: { status: 'published' },
    });

    const after = await call('GET', `/products/${vismoId}`);
    expect(after.body.data.rating.reviewCount).toBe(
      before.body.data.rating.reviewCount + 1,
    );

    const publicList = await call('GET', `/products/${vismoId}/reviews`);
    expect(
      publicList.body.data.map((review: { id: string }) => review.id),
    ).toContain(created.body.data.id);
  });

  it('снимает дату публикации при скрытии отзыва', async () => {
    const { token } = await newUser('moderate-hide');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 3,
        title: 'К скрытию',
        body: 'Отзыв будет опубликован, а затем скрыт модератором.',
        experience: '1_to_6_months',
      },
    });
    const reviewId = created.body.data.id;
    const adminToken = await loginSeed('admin@medizdeliya.local');

    await call('PATCH', `/admin/reviews/${reviewId}/status`, {
      token: adminToken,
      body: { status: 'published' },
    });

    const hidden = await call('PATCH', `/admin/reviews/${reviewId}/status`, {
      token: adminToken,
      body: { status: 'hidden', comment: 'Нарушение правил' },
    });

    expect(hidden.body.data.status).toBe('hidden');
    expect(hidden.body.data.publishedAt).toBeNull();

    // Скрытый отзыв исчезает из публичного списка.
    const publicList = await call('GET', `/products/${productIds.get('Vismo')}/reviews`);
    expect(
      publicList.body.data.map((review: { id: string }) => review.id),
    ).not.toContain(reviewId);

    // История сохраняет оба перехода.
    const history = await call('GET', `/admin/reviews/${reviewId}/history`, {
      token: adminToken,
    });
    expect(history.body.data).toHaveLength(2);
  });

  it('отклоняет переход в тот же статус', async () => {
    const { token } = await newUser('moderate-same');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 4,
        title: 'Тот же статус',
        body: 'Повторный перевод в moderation должен быть отклонён.',
        experience: '1_to_6_months',
      },
    });

    const adminToken = await loginSeed('admin@medizdeliya.local');
    const result = await call('PATCH', `/admin/reviews/${created.body.data.id}/status`, {
      token: adminToken,
      body: { status: 'moderation' },
    });

    expect(result.status).toBe(409);
    expect(result.body.type).toContain('review-status-unchanged');
  });

  it('запрещён обычному пользователю', async () => {
    const { token } = await newUser('moderate-forbidden');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 4,
        title: 'Своими руками',
        body: 'Автор не должен иметь права публиковать свой отзыв сам.',
        experience: '1_to_6_months',
      },
    });

    const result = await call('PATCH', `/admin/reviews/${created.body.data.id}/status`, {
      token,
      body: { status: 'published' },
    });

    expect(result.status).toBe(403);
    expect(result.body.type).toContain('forbidden');
  });

  it('запрещён организации и государственной роли', async () => {
    const { token } = await newUser('moderate-target');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 4,
        title: 'Проверка ролей',
        body: 'Ни organization, ни government не модерируют отзывы.',
        experience: '1_to_6_months',
      },
    });

    for (const email of ['clinic@medizdeliya.local', 'gov@medizdeliya.local']) {
      const otherToken = await loginSeed(email);
      const result = await call('PATCH', `/admin/reviews/${created.body.data.id}/status`, {
        token: otherToken,
        body: { status: 'published' },
      });
      expect(result.status).toBe(403);
    }
  });

  it('отклоняет неизвестный статус', async () => {
    const { token } = await newUser('moderate-bad-status');
    const created = await call('POST', `/products/${productIds.get('Vismo')}/reviews`, {
      token,
      body: {
        rating: 4,
        title: 'Неизвестный статус',
        body: 'Статуса approved в справочнике нет.',
        experience: '1_to_6_months',
      },
    });

    const adminToken = await loginSeed('admin@medizdeliya.local');
    const result = await call('PATCH', `/admin/reviews/${created.body.data.id}/status`, {
      token: adminToken,
      body: { status: 'approved' },
    });

    expect(result.status).toBe(422);
  });
});

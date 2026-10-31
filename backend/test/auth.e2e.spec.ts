/**
 * Интеграционные тесты авторизации и RBAC.
 *
 * Работают против реальной PostgreSQL (DATABASE_URL), поднятой миграциями и
 * seed. Созданные тестами пользователи удаляются в afterAll, seed-данные не
 * изменяются.
 *
 * Rate limit отключён переменной THROTTLE_DISABLED: серия регистраций иначе
 * упирается в лимит 5 запросов в минуту на /auth/register. Сам лимит
 * проверяется отдельным файлом throttling.e2e.spec.ts, который поднимает
 * приложение с включённым guard.
 */

import fastifyCookie from '@fastify/cookie';

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = process.env.SEED_DEV_PASSWORD ?? 'DevOnly-Seed-Password-2026';
const SEED_USER = 'user@medizdeliya.local';
const SEED_CLINIC = 'clinic@medizdeliya.local';

let app: NestFastifyApplication;
let prisma: PrismaService;
const createdEmails: string[] = [];

/** Адрес, уникальный для прогона: тесты не конфликтуют между собой. */
function uniqueEmail(prefix: string): string {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  createdEmails.push(email);
  return email;
}

interface HttpResult {
  status: number;
  body: any;
  cookies: string[];
}

async function call(
  method: string,
  path: string,
  options: { body?: Record<string, unknown>; token?: string; cookie?: string } = {},
): Promise<HttpResult> {
  const response = await app.inject({
    method: method as 'GET',
    url: `/api/v1${path}`,
    ...(options.body !== undefined ? { payload: options.body } : {}),
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
  });

  let body: unknown = undefined;
  if (response.body) {
    try {
      body = JSON.parse(response.body);
    } catch {
      body = response.body;
    }
  }

  return {
    status: response.statusCode,
    body,
    cookies: (response.headers['set-cookie'] as string[] | string | undefined)
      ? ([] as string[]).concat(response.headers['set-cookie'] as never)
      : [],
  };
}

function refreshCookieFrom(result: HttpResult): string {
  const raw = result.cookies.find((cookie) =>
    cookie.startsWith('medizdeliya_refresh='),
  );
  if (!raw) throw new Error('В ответе нет cookie medizdeliya_refresh');
  return raw.split(';')[0]!;
}

async function login(email: string, password = SEED_PASSWORD): Promise<HttpResult> {
  return call('POST', '/auth/login', { body: { email, password } });
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
}, 60_000);

afterAll(async () => {
  if (prisma && createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.organization.deleteMany({
      where: { name: { startsWith: 'Тестовая организация ' } },
    });
  }
  await app?.close();
});

describe('Регистрация', () => {
  it('создаёт пользователя с ролью user и выдаёт сессию', async () => {
    const email = uniqueEmail('user');
    const result = await call('POST', '/auth/register', {
      body: { email, password: 'VeryLongPassword1', displayName: 'Тестовый пользователь' },
    });

    expect(result.status).toBe(201);
    expect(result.body.data.user.roles).toEqual(['user']);
    expect(result.body.data.user.email).toBe(email);
    expect(result.body.data.accessToken).toBeTypeOf('string');
    // Refresh token обязан уходить только в HttpOnly-cookie.
    expect(result.body.data.refreshToken).toBeUndefined();

    const cookie = result.cookies.find((c) => c.startsWith('medizdeliya_refresh='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
  });

  it('создаёт организацию в статусе pending и делает автора администратором', async () => {
    const email = uniqueEmail('org');
    const organizationName = `Тестовая организация ${Date.now()}`;

    const result = await call('POST', '/auth/register', {
      body: {
        email,
        password: 'VeryLongPassword1',
        displayName: 'Клиника',
        role: 'organization',
        organizationName,
      },
    });

    expect(result.status).toBe(201);
    expect(result.body.data.user.roles).toEqual(
      expect.arrayContaining(['user', 'organization']),
    );

    const [organization] = result.body.data.user.organizations;
    expect(organization.name).toBe(organizationName);
    // Подтверждение организации — ручная процедура, самостоятельно его не получить.
    expect(organization.verificationStatus).toBe('pending');
    expect(organization.verified).toBe(false);
    expect(organization.memberRole).toBe('administrator');
  });

  it('не позволяет выдать себе роль government', async () => {
    const result = await call('POST', '/auth/register', {
      body: {
        email: uniqueEmail('gov'),
        password: 'VeryLongPassword1',
        displayName: 'Аноним',
        role: 'government',
      },
    });

    expect(result.status).toBe(422);
    expect(result.body.errors.role).toBeDefined();
  });

  it('не позволяет выдать себе роль admin', async () => {
    const result = await call('POST', '/auth/register', {
      body: {
        email: uniqueEmail('adm'),
        password: 'VeryLongPassword1',
        displayName: 'Аноним',
        role: 'admin',
      },
    });

    expect(result.status).toBe(422);
  });

  it('отклоняет повторную регистрацию того же адреса', async () => {
    const email = uniqueEmail('dup');
    const body = { email, password: 'VeryLongPassword1', displayName: 'Первый' };

    expect((await call('POST', '/auth/register', { body })).status).toBe(201);

    const second = await call('POST', '/auth/register', { body });
    expect(second.status).toBe(409);
    expect(second.body.type).toContain('email-already-used');
  });

  it('считает адрес регистронезависимым (citext)', async () => {
    const email = uniqueEmail('case');
    await call('POST', '/auth/register', {
      body: { email, password: 'VeryLongPassword1', displayName: 'Регистр' },
    });

    const upper = await call('POST', '/auth/register', {
      body: {
        email: email.toUpperCase(),
        password: 'VeryLongPassword1',
        displayName: 'Регистр',
      },
    });

    expect(upper.status).toBe(409);
  });

  it('возвращает Problem Details с разбивкой по полям', async () => {
    const result = await call('POST', '/auth/register', {
      body: { email: 'не-почта', password: 'short', displayName: 'A' },
    });

    expect(result.status).toBe(422);
    expect(result.body.type).toContain('validation-failed');
    expect(Object.keys(result.body.errors).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
  });
});

describe('Вход', () => {
  it('пускает пользователя из seed', async () => {
    const result = await login(SEED_CLINIC);

    expect(result.status).toBe(200);
    expect(result.body.data.user.email).toBe(SEED_CLINIC);
    expect(result.body.data.user.roles).toEqual(
      expect.arrayContaining(['user', 'organization']),
    );
  });

  it('вычисляет бейдж verified из статуса организации, а не хранит его', async () => {
    const result = await login(SEED_CLINIC);
    const [organization] = result.body.data.user.organizations;

    expect(organization.verificationStatus).toBe('verified');
    expect(organization.verified).toBe(true);
  });

  it('отклоняет неверный пароль', async () => {
    const result = await login(SEED_CLINIC, 'definitely-wrong-password');

    expect(result.status).toBe(401);
    expect(result.body.type).toContain('invalid-credentials');
  });

  it('отвечает одинаково на несуществующий адрес и неверный пароль', async () => {
    const unknown = await login('no-such-user@example.test', 'whatever-password');
    const wrong = await login(SEED_CLINIC, 'definitely-wrong-password');

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.type).toBe(wrong.body.type);
    expect(unknown.body.title).toBe(wrong.body.title);
  });
});

describe('Ротация refresh token', () => {
  it('выдаёт новый токен и отзывает прежний', async () => {
    const session = await login(SEED_USER);
    const first = refreshCookieFrom(session);

    const rotated = await call('POST', '/auth/refresh', { cookie: first });
    expect(rotated.status).toBe(200);

    const second = refreshCookieFrom(rotated);
    expect(second).not.toBe(first);
  });

  it('при повторном использовании отзывает всю цепочку сессий', async () => {
    const session = await login(SEED_USER);
    const stolen = refreshCookieFrom(session);

    const rotated = await call('POST', '/auth/refresh', { cookie: stolen });
    const fresh = refreshCookieFrom(rotated);

    // Злоумышленник предъявляет уже использованный токен.
    const reuse = await call('POST', '/auth/refresh', { cookie: stolen });
    expect(reuse.status).toBe(401);
    expect(reuse.body.type).toContain('refresh-token-reused');

    // Легитимный новый токен тоже обязан перестать работать.
    const afterBreach = await call('POST', '/auth/refresh', { cookie: fresh });
    expect(afterBreach.status).toBe(401);
  });

  it('отклоняет запрос без cookie', async () => {
    const result = await call('POST', '/auth/refresh');

    expect(result.status).toBe(401);
    expect(result.body.type).toContain('invalid-refresh-token');
  });
});

describe('Выход', () => {
  it('делает access token нерабочим до истечения его срока', async () => {
    const session = await login(SEED_USER);
    const token = session.body.data.accessToken;
    const cookie = refreshCookieFrom(session);

    expect((await call('GET', '/auth/me', { token })).status).toBe(200);

    const logout = await call('POST', '/auth/logout', { cookie });
    expect(logout.status).toBe(204);

    const after = await call('GET', '/auth/me', { token });
    expect(after.status).toBe(401);
  });
});

describe('Восстановление пароля', () => {
  it('отвечает одинаково для существующего и несуществующего адреса', async () => {
    const known = await call('POST', '/auth/recovery/request', {
      body: { email: SEED_USER },
    });
    const unknown = await call('POST', '/auth/recovery/request', {
      body: { email: 'nobody@example.test' },
    });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    // Токен не должен попадать в ответ.
    expect(JSON.stringify(known.body)).not.toContain('token');
  });

  it('отклоняет несуществующий токен', async () => {
    const result = await call('POST', '/auth/recovery/confirm', {
      body: { token: 'a'.repeat(43), password: 'VeryLongPassword1' },
    });

    expect(result.status).toBe(400);
    expect(result.body.type).toContain('invalid-reset-token');
  });

  it('меняет пароль по корректному токену и завершает старые сессии', async () => {
    const email = uniqueEmail('recovery');
    const oldPassword = 'VeryLongPassword1';
    const newPassword = 'AnotherLongPassword2';

    const registered = await call('POST', '/auth/register', {
      body: { email, password: oldPassword, displayName: 'Восстановление' },
    });
    const oldToken = registered.body.data.accessToken;

    await call('POST', '/auth/recovery/request', { body: { email } });

    // Токен в ответ не отдаётся, поэтому в тесте он берётся из БД — так же,
    // как его взял бы почтовый сервис.
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    const reset = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // Хеш в БД невосстановим, поэтому подменяем его хешем известного значения.
    const plain = 'known-recovery-token-for-test-0000000000';
    const { createHash } = await import('node:crypto');
    await prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { tokenHash: createHash('sha256').update(plain).digest('hex') },
    });

    const confirmed = await call('POST', '/auth/recovery/confirm', {
      body: { token: plain, password: newPassword },
    });
    expect(confirmed.status).toBe(204);

    // Старая сессия завершена.
    expect((await call('GET', '/auth/me', { token: oldToken })).status).toBe(401);
    // Старый пароль больше не подходит, новый — подходит.
    expect((await login(email, oldPassword)).status).toBe(401);
    expect((await login(email, newPassword)).status).toBe(200);

    // Повторное использование токена восстановления невозможно.
    const replay = await call('POST', '/auth/recovery/confirm', {
      body: { token: plain, password: 'YetAnotherPassword3' },
    });
    expect(replay.status).toBe(400);
  });
});

describe('RBAC', () => {
  it('требует авторизацию для /auth/me', async () => {
    const result = await call('GET', '/auth/me');

    expect(result.status).toBe(401);
    expect(result.body.type).toContain('unauthenticated');
  });

  it('отклоняет подделанный access token', async () => {
    const result = await call('GET', '/auth/me', { token: 'not.a.jwt' });

    expect(result.status).toBe(401);
  });

  it('не принимает refresh token вместо access token', async () => {
    const session = await login(SEED_USER);
    const refreshValue = refreshCookieFrom(session).split('=')[1]!;

    const result = await call('GET', '/auth/me', { token: refreshValue });
    expect(result.status).toBe(401);
  });

  it('роли берутся из user_roles, а не из тела запроса', async () => {
    const email = uniqueEmail('roles');
    const registered = await call('POST', '/auth/register', {
      body: {
        email,
        password: 'VeryLongPassword1',
        displayName: 'Обычный',
        // Клиент пытается подсунуть лишние поля.
        roles: ['admin', 'government'],
      },
    });

    expect(registered.status).toBe(201);
    expect(registered.body.data.user.roles).toEqual(['user']);

    const me = await call('GET', '/auth/me', {
      token: registered.body.data.accessToken,
    });
    expect(me.body.data.roles).toEqual(['user']);
  });
});

describe('Формат ответов', () => {
  it('успешные ответы обёрнуты в data', async () => {
    const result = await call('GET', '/health');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: { status: 'ok', database: 'up' } });
  });

  it('ошибки соответствуют RFC 9457', async () => {
    const result = await call('GET', '/auth/me');

    expect(result.body).toMatchObject({
      type: expect.stringContaining('https://medizdeliya.local/problems/'),
      title: expect.any(String),
      status: 401,
      instance: '/api/v1/auth/me',
    });
    expect(result.body.requestId).toBeTypeOf('string');
  });
});

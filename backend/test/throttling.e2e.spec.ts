/**
 * Rate limit на /auth/* с включённым guard.
 *
 * Отдельный файл, потому что auth.e2e.spec.ts отключает троттлинг
 * (THROTTLE_DISABLED=true), иначе серия регистраций упирается в лимит.
 * vitest.config.ts запускает файлы последовательно, так что переменная
 * окружения одного файла не влияет на другой.
 */


import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

let app: NestFastifyApplication;

beforeAll(async () => {
  process.env.THROTTLE_DISABLED = 'false';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('Rate limit', () => {
  it('отдаёт 429 после превышения лимита на /auth/login', async () => {
    const statuses: number[] = [];

    // Лимит профиля auth на login — 10 запросов в минуту.
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'throttle@example.test', password: 'wrong-password-1' },
      });
      statuses.push(response.statusCode);
    }

    expect(statuses).toContain(429);
    // До срабатывания лимита ответы — обычные 401, а не ошибки сервера.
    expect(statuses.filter((status) => status === 401).length).toBeGreaterThan(0);
    expect(statuses.filter((status) => status >= 500).length).toBe(0);
  });

  it('ошибка лимита тоже оформлена как Problem Details', async () => {
    let body: Record<string, unknown> | undefined;

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/recovery/request',
        payload: { email: 'throttle2@example.test' },
      });
      if (response.statusCode === 429) {
        body = JSON.parse(response.body);
        break;
      }
    }

    expect(body).toBeDefined();
    expect(body).toMatchObject({
      type: 'https://medizdeliya.local/problems/too-many-requests',
      status: 429,
    });
  });
});

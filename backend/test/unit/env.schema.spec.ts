/**
 * Unit-тесты валидации окружения: приложение не должно подниматься с
 * небезопасной конфигурацией.
 */

import { describe, expect, it } from 'vitest';

import { validateEnv } from '../../src/common/config/env.schema';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('принимает пустые необязательные значения из Docker Compose', () => {
    const env = validateEnv({ ...base, REGISTRY_SOURCE_URL: '', RECOVERY_EMAIL_API_URL: '', RECOVERY_EMAIL_API_KEY: '' });
    expect(env.REGISTRY_SOURCE_URL).toBeUndefined();
    expect(env.RECOVERY_EMAIL_API_URL).toBeUndefined();
    expect(env.RECOVERY_EMAIL_API_KEY).toBeUndefined();
  });
  it('подставляет значения по умолчанию', () => {
    const env = validateEnv({ ...base });

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.THROTTLE_DISABLED).toBe(false);
    expect(env.FRONTEND_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('разбирает список источников CORS', () => {
    const env = validateEnv({
      ...base,
      FRONTEND_ORIGINS: 'http://localhost:5173, https://example.com ,',
    });

    expect(env.FRONTEND_ORIGINS).toEqual(['http://localhost:5173', 'https://example.com']);
  });

  it('отклоняет короткие секреты', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'слишком-короткий' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: 'abc' })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('требует DATABASE_URL', () => {
    const { DATABASE_URL: _unused, ...withoutUrl } = base;
    expect(() => validateEnv(withoutUrl)).toThrow(/DATABASE_URL/);
  });

  it('запрещает отключение rate limit в production', () => {
    // Иначе флаг для тестов можно было бы случайно оставить включённым.
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', THROTTLE_DISABLED: 'true' }),
    ).toThrow(/rate limit/);

    expect(
      validateEnv({ ...base, NODE_ENV: 'test', THROTTLE_DISABLED: 'true' }).THROTTLE_DISABLED,
    ).toBe(true);
  });

  it('приводит PORT к числу и отклоняет некорректный', () => {
    expect(validateEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
    expect(() => validateEnv({ ...base, PORT: '0' })).toThrow();
    expect(() => validateEnv({ ...base, PORT: 'порт' })).toThrow();
  });
});

import { z } from 'zod';

/**
 * Валидация окружения при старте. Приложение не поднимается с пустыми или
 * слишком короткими секретами — иначе JWT можно подобрать.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET должен быть не короче 32 символов'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET должен быть не короче 32 символов'),

  /** Список источников для CORS через запятую. */
  FRONTEND_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  PORT: z.coerce.number().int().positive().default(3000),

  STORAGE_DRIVER: z.enum(['local']).default('local'),

  /**
   * Полное отключение rate limit. Нужно только интеграционным тестам,
   * которые регистрируют десятки пользователей подряд и иначе упирались бы
   * в лимит 5 запросов в минуту на /auth/register.
   *
   * В production значение true запрещено: проверка ниже в superRefine.
   */
  THROTTLE_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /** Только для локального seed, в рантайме не используется. */
  SEED_DEV_PASSWORD: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.THROTTLE_DISABLED) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['THROTTLE_DISABLED'],
      message: 'Отключать rate limit в production нельзя',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректное окружение:\n${details}`);
  }

  return result.data;
}

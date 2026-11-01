import { z } from 'zod';

// Compose substitutes unset optional variables with empty strings.
const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => value === '' ? undefined : value, schema.optional());

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
   * Общий лимит запросов в минуту на один адрес.
   *
   * Значение рассчитано на обычную работу интерфейса: один просмотр карточки
   * изделия — это 4–5 запросов (карточка, документы, отзывы, аналоги,
   * справочник фильтров), поэтому слишком низкий лимит ломает нормальную
   * навигацию, а не только злоупотребления. Вход, регистрация и
   * восстановление пароля ограничены отдельно и гораздо строже.
   */
  THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(600),

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

  /**
   * Источник номенклатурной классификации медицинских изделий.
   *
   * Адрес и имя файла вынесены в окружение, потому что схема именования
   * выгрузки официально не описана и выведена из перечня версий на странице
   * набора (ADR 0009). NOMENCLATURE_LOCAL_FILE позволяет загрузить ранее
   * скачанный архив или XML, не обращаясь к сети, — так работают тесты.
   */
  NOMENCLATURE_SOURCE_URL: optionalString(z.string().url()),
  NOMENCLATURE_FILE_NAME: optionalString(z.string().min(1)),
  NOMENCLATURE_LOCAL_FILE: optionalString(z.string().min(1)),

  /**
   * Государственный реестр медицинских изделий.
   *
   * Хост отдаёт сертификат национального УЦ Минцифры, поэтому процессу нужен
   * NODE_EXTRA_CA_CERTS=certs/russian-trusted-ca.pem (ADR 0010).
   */
  REGISTRY_SOURCE_URL: optionalString(z.string().url()),
  REGISTRY_LOCAL_FILE: optionalString(z.string().min(1)),

  /** 0 disables periodic refresh; test processes never start background timers. */
  ANALYTICS_REFRESH_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(15),
  RECOVERY_EMAIL_API_URL: optionalString(z.string().url()),
  RECOVERY_EMAIL_API_KEY: optionalString(z.string().min(1)),
  RECOVERY_EMAIL_FROM: optionalString(z.string().min(1)),
  RECOVERY_RESET_URL: optionalString(z.string().url()),

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

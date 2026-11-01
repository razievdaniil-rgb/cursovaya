/** Коды ролей из таблицы `roles`. Строками в коде больше нигде не дублируются. */
export const ROLE = {
  user: 'user',
  organization: 'organization',
  government: 'government',
  admin: 'admin',
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

/**
 * Роли, которые пользователь может получить при самостоятельной регистрации.
 *
 * `government` и `admin` в этот список намеренно не входят: право смотреть
 * государственную аналитику и модерировать отзывы выдаёт администратор
 * платформы. Иначе любой желающий получил бы доступ к разделам
 * `/government/*` и `/admin/*`, просто выбрав роль в форме регистрации.
 */
export const SELF_ASSIGNABLE_ROLES: readonly RoleCode[] = [
  ROLE.user,
  ROLE.organization,
];

export const ACCOUNT_STATUS = {
  active: 'active',
  blocked: 'blocked',
  pending: 'pending',
} as const;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 минут (ADR 0005)
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 дней
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 час

export const REFRESH_COOKIE_NAME = 'medizdeliya_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

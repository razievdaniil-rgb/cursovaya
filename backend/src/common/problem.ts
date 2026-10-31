import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Ошибки в формате RFC 9457 Problem Details.
 *
 * `type` — стабильный URI-идентификатор проблемы, по нему клиент может
 * различать случаи, не разбирая текст. Домен `medizdeliya.local`
 * зарезервирован для внутренних типов: публичных страниц по этим адресам нет.
 */
const TYPE_PREFIX = 'https://medizdeliya.local/problems';

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

export class ProblemException extends HttpException {
  constructor(body: ProblemBody) {
    super(body, body.status);
  }

  get problem(): ProblemBody {
    return this.getResponse() as ProblemBody;
  }
}

function problem(
  slug: string,
  title: string,
  status: HttpStatus,
  detail?: string,
  extensions?: Record<string, unknown>,
): ProblemException {
  return new ProblemException({
    type: `${TYPE_PREFIX}/${slug}`,
    title,
    status,
    ...(detail ? { detail } : {}),
    ...extensions,
  });
}

export const Problems = {
  validationFailed: (errors: Record<string, string[]>) =>
    problem(
      'validation-failed',
      'Некорректные данные запроса',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Проверьте перечисленные поля.',
      { errors },
    ),

  invalidCredentials: () =>
    problem(
      'invalid-credentials',
      'Неверный адрес электронной почты или пароль',
      HttpStatus.UNAUTHORIZED,
    ),

  emailAlreadyUsed: () =>
    problem(
      'email-already-used',
      'Адрес электронной почты уже зарегистрирован',
      HttpStatus.CONFLICT,
    ),

  accountBlocked: () =>
    problem(
      'account-blocked',
      'Учётная запись заблокирована',
      HttpStatus.FORBIDDEN,
    ),

  unauthenticated: (detail?: string) =>
    problem(
      'unauthenticated',
      'Требуется авторизация',
      HttpStatus.UNAUTHORIZED,
      detail,
    ),

  invalidRefreshToken: () =>
    problem(
      'invalid-refresh-token',
      'Refresh token недействителен',
      HttpStatus.UNAUTHORIZED,
      'Войдите в систему заново.',
    ),

  refreshTokenReused: () =>
    problem(
      'refresh-token-reused',
      'Обнаружено повторное использование refresh token',
      HttpStatus.UNAUTHORIZED,
      'Все активные сессии отозваны из соображений безопасности. Войдите заново.',
    ),

  forbidden: (detail?: string) =>
    problem('forbidden', 'Недостаточно прав', HttpStatus.FORBIDDEN, detail),

  notOrganizationMember: () =>
    problem(
      'not-organization-member',
      'Нет доступа к этой организации',
      HttpStatus.FORBIDDEN,
      'Запрошенная организация не входит в список ваших организаций.',
    ),

  notFound: (what: string) =>
    problem('not-found', `${what} не найдено`, HttpStatus.NOT_FOUND),

  reviewAlreadyExists: () =>
    problem(
      'review-already-exists',
      'Вы уже оставляли отзыв на это изделие',
      HttpStatus.CONFLICT,
      'Отредактируйте существующий отзыв вместо создания нового.',
    ),

  reviewStatusUnchanged: (code: string) =>
    problem(
      'review-status-unchanged',
      'Отзыв уже находится в этом статусе',
      HttpStatus.CONFLICT,
      `Текущий статус — «${code}».`,
    ),

  comparisonFull: (limit: number) =>
    problem(
      'comparison-full',
      `Для сравнения можно выбрать не более ${limit} изделий`,
      HttpStatus.CONFLICT,
      'Удалите одно из изделий, чтобы добавить новое.',
    ),

  alreadyInCollection: (what: string) =>
    problem('already-in-collection', `${what} уже добавлено`, HttpStatus.CONFLICT),

  syncSourceDisabled: () =>
    problem(
      'sync-source-disabled',
      'Источник данных отключён',
      HttpStatus.CONFLICT,
      'Включите источник, прежде чем запускать загрузку.',
    ),

  invalidResetToken: () =>
    problem(
      'invalid-reset-token',
      'Ссылка восстановления недействительна или истекла',
      HttpStatus.BAD_REQUEST,
    ),

  roleNotSelfAssignable: (roleCode: string) =>
    problem(
      'role-not-self-assignable',
      'Эту роль нельзя назначить себе при регистрации',
      HttpStatus.FORBIDDEN,
      `Роль «${roleCode}» выдаётся администратором платформы.`,
    ),

  tooManyRequests: () =>
    problem(
      'too-many-requests',
      'Слишком много запросов',
      HttpStatus.TOO_MANY_REQUESTS,
      'Повторите попытку позже.',
    ),

  internal: () =>
    problem(
      'internal-error',
      'Внутренняя ошибка сервера',
      HttpStatus.INTERNAL_SERVER_ERROR,
    ),
} as const;

export { TYPE_PREFIX as PROBLEM_TYPE_PREFIX };

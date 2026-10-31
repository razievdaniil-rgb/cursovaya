import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard с единственным отличием: его можно полностью выключить
 * переменной THROTTLE_DISABLED.
 *
 * Это нужно интеграционным тестам, которые регистрируют десятки пользователей
 * подряд и иначе упираются в лимит 5 запросов в минуту на /auth/register.
 *
 * Значение читается прямо из process.env, а не через ConfigService: guard
 * создаётся как APP_GUARD раньше, чем доступен ConfigService, и собственный
 * конструктор пришлось бы согласовывать с сигнатурой базового класса.
 * Корректность значения при этом гарантирована: env.schema.ts валидирует
 * THROTTLE_DISABLED при старте и запрещает значение true в production.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.THROTTLE_DISABLED === 'true') return true;

    return super.canActivate(context);
  }
}

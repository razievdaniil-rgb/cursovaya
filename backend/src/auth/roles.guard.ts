import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Problems } from '../common/problem';
import type { RoleCode } from './auth.constants';
import type { AuthenticatedRequest } from './jwt-auth.guard';

export const ROLES_KEY = 'auth:roles';

/** Доступ только носителям одной из перечисленных ролей. */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) throw Problems.unauthenticated();

    if (!required.some((role) => user.roles.includes(role))) {
      throw Problems.forbidden(
        `Требуется одна из ролей: ${required.join(', ')}.`,
      );
    }

    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { ROLE } from '../auth/auth.constants';
import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Проверка членства в организации для всех `/organization/*` эндпоинтов.
 *
 * Идентификатор организации берётся из пути или query (`organizationId`).
 * Если он не указан, используется единственная организация пользователя;
 * при нескольких организациях запрос обязан указать, о какой речь.
 * Роль `admin` проверку членства не обходит: это сделано осознанно, чтобы
 * администратор не читал кабинет организации «по умолчанию».
 */
@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) throw Problems.unauthenticated();

    if (!user.roles.includes(ROLE.organization)) {
      throw Problems.forbidden('Требуется роль organization.');
    }

    const requested = readOrganizationId(request);

    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.id },
      select: { organizationId: true },
    });

    if (memberships.length === 0) throw Problems.notOrganizationMember();

    if (requested) {
      const allowed = memberships.some(
        (membership) => membership.organizationId === requested,
      );
      if (!allowed) throw Problems.notOrganizationMember();
      request.organizationId = requested;
      return true;
    }

    if (memberships.length > 1) {
      throw Problems.forbidden(
        'Укажите organizationId: пользователь состоит в нескольких организациях.',
      );
    }

    request.organizationId = memberships[0]!.organizationId;
    return true;
  }
}

function readOrganizationId(request: FastifyRequest): string | undefined {
  const params = request.params as Record<string, string> | undefined;
  const query = request.query as Record<string, string> | undefined;

  return params?.organizationId ?? query?.organizationId ?? undefined;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Организация, к которой относится запрос; ставит guard. */
    organizationId?: string;
  }
}

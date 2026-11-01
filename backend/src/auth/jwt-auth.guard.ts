import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_STATUS, type RoleCode } from './auth.constants';
import { TokensService } from './tokens.service';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Снимает требование авторизации с конкретного маршрута. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface RequestUser {
  id: string;
  roles: RoleCode[];
  sessionId: string;
}

/** Fastify-запрос с присоединённым пользователем. */
export type AuthenticatedRequest = FastifyRequest & { user?: RequestUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw Problems.unauthenticated('Ожидается заголовок Authorization: Bearer.');
    }

    const token = header.slice('Bearer '.length).trim();

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      throw Problems.unauthenticated('Access token недействителен или истёк.');
    }

    // Сессия могла быть отозвана (logout, смена пароля, обнаружение кражи)
    // раньше, чем истёк короткоживущий access token.
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: payload.sid },
      select: {
        revokedAt: true,
        userId: true,
        user: { select: { accountStatus: { select: { code: true } } } },
      },
    });

    if (!session || session.userId !== payload.sub) {
      throw Problems.unauthenticated('Сессия не найдена.');
    }
    if (session.revokedAt !== null) {
      throw Problems.unauthenticated('Сессия завершена. Войдите заново.');
    }
    if (session.user.accountStatus.code === ACCOUNT_STATUS.blocked) {
      throw Problems.accountBlocked();
    }

    request.user = {
      id: payload.sub,
      roles: payload.roles,
      sessionId: payload.sid,
    };

    return true;
  }
}

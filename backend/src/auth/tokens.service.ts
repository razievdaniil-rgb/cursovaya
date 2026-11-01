import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  type RoleCode,
} from './auth.constants';

export interface AccessTokenPayload {
  /** id пользователя. */
  sub: string;
  roles: RoleCode[];
  /** id access token, для журналирования. */
  jti: string;
  /** id записи refresh_tokens, к которой привязана сессия. */
  sid: string;
}

export interface IssuedRefreshToken {
  /** Значение для cookie. В БД не хранится. */
  token: string;
  recordId: string;
  expiresAt: Date;
}

/** Хеш токена — единственное, что попадает в БД (ADR 0005). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  // IP не хранится в открытом виде: для разбора инцидентов достаточно хеша.
  return createHash('sha256').update(ip).digest('hex');
}

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(
    userId: string,
    roles: RoleCode[],
    sessionId: string,
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      roles,
      jti: randomUUID(),
      sid: sessionId,
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Создаёт новую запись refresh_tokens и возвращает открытое значение. */
  async issueRefreshToken(
    userId: string,
    context: { userAgent?: string; ip?: string },
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    const record = await client.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: context.userAgent?.slice(0, 512) ?? null,
        ipHash: hashIp(context.ip),
      },
      select: { id: true },
    });

    return { token, recordId: record.id, expiresAt };
  }

  /** Отзывает все активные токены пользователя (logout everywhere, кража). */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }
}

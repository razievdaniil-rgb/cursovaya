import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCOUNT_STATUS,
  PASSWORD_RESET_TTL_SECONDS,
  ROLE,
  SELF_ASSIGNABLE_ROLES,
  type RoleCode,
} from './auth.constants';
import { PasswordService } from './password.service';
import { TokensService, hashToken } from './tokens.service';
import { RecoveryDeliveryService } from './recovery-delivery.service';
import type {
  LoginInput,
  RecoveryConfirmInput,
  RegisterInput,
} from './auth.schema';

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleCode[];
  accountStatus: string;
  emailVerified: boolean;
  organizations: {
    id: string;
    name: string;
    shortName: string | null;
    memberRole: string;
    verificationStatus: string;
    verified: boolean;
  }[];
}

export interface AuthResult {
  user: AuthenticatedUser;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly recoveryDelivery: RecoveryDeliveryService,
  ) {}

  // -------------------------------------------------------------------------
  // Регистрация
  // -------------------------------------------------------------------------

  async register(input: RegisterInput, context: SessionContext): Promise<AuthResult> {
    const requestedRole = input.role as RoleCode;

    if (!SELF_ASSIGNABLE_ROLES.includes(requestedRole)) {
      throw Problems.roleNotSelfAssignable(requestedRole);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw Problems.emailAlreadyUsed();

    const passwordHash = await this.passwords.hash(input.password);

    const userId = await this.prisma.$transaction(async (tx) => {
      const activeStatus = await tx.accountStatus.findUniqueOrThrow({
        where: { code: ACCOUNT_STATUS.active },
        select: { id: true },
      });

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          accountStatusId: activeStatus.id,
        },
        select: { id: true },
      });

      // Роль `user` есть у каждого; `organization` добавляется сверху.
      const roleCodes: RoleCode[] =
        requestedRole === ROLE.organization ? [ROLE.user, ROLE.organization] : [ROLE.user];

      const roles = await tx.role.findMany({
        where: { code: { in: roleCodes } },
        select: { id: true },
      });

      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
        skipDuplicates: true,
      });

      if (requestedRole === ROLE.organization && input.organizationName) {
        // Организация создаётся со статусом `pending`: подтверждение —
        // ручная процедура, самостоятельно его получить нельзя.
        const [type, status, memberRole] = await Promise.all([
          tx.organizationType.findUniqueOrThrow({
            where: { code: 'medical' },
            select: { id: true },
          }),
          tx.organizationVerificationStatus.findUniqueOrThrow({
            where: { code: 'pending' },
            select: { id: true },
          }),
          tx.organizationMemberRole.findUniqueOrThrow({
            where: { code: 'administrator' },
            select: { id: true },
          }),
        ]);

        const organization = await tx.organization.create({
          data: {
            organizationTypeId: type.id,
            verificationStatusId: status.id,
            name: input.organizationName,
            shortName: input.organizationName.slice(0, 255),
            inn: input.organizationInn ?? null,
          },
          select: { id: true },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            memberRoleId: memberRole.id,
          },
        });
      }

      return user.id;
    });

    return this.issueSession(userId, context);
  }

  // -------------------------------------------------------------------------
  // Вход
  // -------------------------------------------------------------------------

  async login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        accountStatus: { select: { code: true } },
      },
    });

    // Пароль проверяется даже для несуществующего адреса, чтобы время ответа
    // не выдавало, зарегистрирован ли email.
    const storedHash =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c2VlZHNlZWRzZWVkc2VlZA$0000000000000000000000000000000000000000000';
    const passwordMatches = await this.passwords.verify(storedHash, input.password);

    if (!user || !passwordMatches) throw Problems.invalidCredentials();

    if (user.accountStatus.code === ACCOUNT_STATUS.blocked) {
      throw Problems.accountBlocked();
    }

    return this.issueSession(user.id, context);
  }

  // -------------------------------------------------------------------------
  // Ротация refresh token
  // -------------------------------------------------------------------------

  /**
   * Ротация с обнаружением повторного использования: предъявление уже
   * отозванного токена отзывает все сессии пользователя (ADR 0005).
   */
  async refresh(presentedToken: string, context: SessionContext): Promise<AuthResult> {
    const tokenHash = hashToken(presentedToken);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { accountStatus: { select: { code: true } } } },
      },
    });

    if (!record) throw Problems.invalidRefreshToken();

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Shared with reset, so replay revocation cannot miss an in-flight successor.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${record.userId}::uuid FOR UPDATE`;
      const current = await tx.refreshToken.findUniqueOrThrow({ where: { id: record.id } });
      if (current.revokedAt !== null) {
        await tx.refreshToken.updateMany({
          where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() },
        });
        return { kind: 'reused' as const };
      }
      if (current.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };
      const account = await tx.user.findUniqueOrThrow({
        where: { id: record.userId }, select: { accountStatus: { select: { code: true } } },
      });
      if (account.accountStatus.code === ACCOUNT_STATUS.blocked) {
        await tx.refreshToken.updateMany({
          where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() },
        });
        return { kind: 'blocked' as const };
      }
      const claimed = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) return { kind: 'invalid' as const };
      const issued = await this.tokens.issueRefreshToken(record.userId, context, tx);
      await tx.refreshToken.update({ where: { id: record.id }, data: { replacedById: issued.recordId } });
      return { kind: 'issued' as const, issued };
    });
    // Commit replay revocation before raising the HTTP error.
    if (outcome.kind === 'reused') throw Problems.refreshTokenReused();
    if (outcome.kind === 'blocked') throw Problems.accountBlocked();
    if (outcome.kind !== 'issued') throw Problems.invalidRefreshToken();
    const { issued } = outcome;

    const user = await this.loadUser(record.userId);
    const accessToken = await this.tokens.signAccessToken(
      user.id,
      user.roles,
      issued.recordId,
    );

    return {
      user,
      accessToken,
      accessTokenExpiresIn: 15 * 60,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // Выход
  // -------------------------------------------------------------------------

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Восстановление пароля
  // -------------------------------------------------------------------------

  /**
   * При рабочей доставке возвращает `{ sent: true }`, независимо от того, существует ли
   * адрес, — иначе эндпоинт превращается в проверку наличия учётной записи.
   * Токен передаётся только сервису доставки, никогда в лог.
   */
  async requestRecovery(email: string): Promise<{ sent: true }> {
    this.recoveryDelivery.assertConfigured();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) return { sent: true };

    const token = randomBytes(32).toString('base64url');

    const reset = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
      },
    });

    try {
      await this.recoveryDelivery.send(email, token);
    } catch {
      await this.prisma.passwordResetToken.delete({ where: { id: reset.id } });
      throw this.recoveryDelivery.unavailable();
    }

    return { sent: true };
  }

  async confirmRecovery(input: RecoveryConfirmInput): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw Problems.invalidResetToken();
    }

    const passwordHash = await this.passwords.hash(input.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${record.userId}::uuid FOR UPDATE`;
      const now = new Date();
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (consumed.count !== 1) throw Problems.invalidResetToken();
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null }, data: { usedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Профиль
  // -------------------------------------------------------------------------

  async loadUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAt: true,
        accountStatus: { select: { code: true } },
        roles: { select: { role: { select: { code: true } } } },
        organizationMembers: {
          select: {
            memberRole: { select: { code: true } },
            organization: {
              select: {
                id: true,
                name: true,
                shortName: true,
                verificationStatus: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    if (!user) throw Problems.notFound('Пользователь');

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((entry) => entry.role.code as RoleCode),
      accountStatus: user.accountStatus.code,
      emailVerified: user.emailVerifiedAt !== null,
      organizations: user.organizationMembers.map((member) => ({
        id: member.organization.id,
        name: member.organization.name,
        shortName: member.organization.shortName,
        memberRole: member.memberRole.code,
        verificationStatus: member.organization.verificationStatus.code,
        // Бейдж «подтверждена» вычисляется, а не хранится (ADR 0003).
        verified: member.organization.verificationStatus.code === 'verified',
      })),
    };
  }

  private async issueSession(
    userId: string,
    context: SessionContext,
  ): Promise<AuthResult> {
    const user = await this.loadUser(userId);
    const issued = await this.tokens.issueRefreshToken(userId, context);
    const accessToken = await this.tokens.signAccessToken(
      userId,
      user.roles,
      issued.recordId,
    );

    return {
      user,
      accessToken,
      accessTokenExpiresIn: 15 * 60,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }
}

/** Повторно экспортируется для тестов, которым нужен тип транзакции. */
export type PrismaTransaction = Prisma.TransactionClient;

import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';

import { Problems } from '../common/problem';
import { ApiProblemResponse, ApiZodBody } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from './auth.constants';
import {
  loginSchema,
  recoveryConfirmSchema,
  recoveryRequestSchema,
  registerSchema,
  type LoginInput,
  type RecoveryConfirmInput,
  type RecoveryRequestInput,
  type RegisterInput,
} from './auth.schema';
import { AuthService, type AuthResult } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Public, type AuthenticatedRequest, type RequestUser } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiZodBody(registerSchema)
  @ApiProblemResponse(422, 'Некорректные данные или недоступная роль')
  @ApiProblemResponse(409, 'Адрес электронной почты уже зарегистрирован')
  @ApiProblemResponse(429, 'Превышен лимит запросов')
  @ApiOperation({
    summary: 'Регистрация',
    description:
      'Доступные для самостоятельного выбора роли — user и organization. ' +
      'Роли government и admin выдаёт администратор платформы.',
  })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.register(input, sessionContext(request));
    return this.respondWithSession(result, reply);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiZodBody(loginSchema)
  @ApiProblemResponse(401, 'Неверный адрес или пароль')
  @ApiProblemResponse(403, 'Учётная запись заблокирована')
  @ApiProblemResponse(429, 'Превышен лимит запросов')
  @ApiOperation({ summary: 'Вход' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(input, sessionContext(request));
    return this.respondWithSession(result, reply);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiProblemResponse(401, 'Токен недействителен или использован повторно')
  @ApiOperation({
    summary: 'Ротация refresh token',
    description:
      'Токен читается из HttpOnly-cookie. Повторное предъявление уже ' +
      'использованного токена отзывает все сессии пользователя.',
  })
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const token = readRefreshCookie(request);
    if (!token) throw Problems.invalidRefreshToken();

    const result = await this.auth.refresh(token, sessionContext(request));
    return this.respondWithSession(result, reply);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Выход' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(reply);
  }

  @Public()
  @Post('recovery/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiZodBody(recoveryRequestSchema)
  @ApiProblemResponse(429, 'Превышен лимит запросов')
  @ApiOperation({
    summary: 'Запрос восстановления пароля',
    description:
      'Всегда отвечает одинаково, независимо от наличия учётной записи, ' +
      'чтобы не раскрывать зарегистрированные адреса.',
  })
  async requestRecovery(
    @Body(new ZodValidationPipe(recoveryRequestSchema)) input: RecoveryRequestInput,
  ) {
    return this.auth.requestRecovery(input.email);
  }

  @Public()
  @Post('recovery/confirm')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiZodBody(recoveryConfirmSchema)
  @ApiProblemResponse(400, 'Ссылка восстановления недействительна или истекла')
  @ApiOperation({ summary: 'Подтверждение нового пароля' })
  async confirmRecovery(
    @Body(new ZodValidationPipe(recoveryConfirmSchema)) input: RecoveryConfirmInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.confirmRecovery(input);
    clearRefreshCookie(reply);
  }

  @Get('me')
  @ApiProblemResponse(401, 'Требуется авторизация')
  @ApiOperation({
    summary: 'Текущий пользователь',
    description: 'Источник истины о сессии вместо localStorage.',
  })
  async me(@CurrentUser() user: RequestUser) {
    return this.auth.loadUser(user.id);
  }

  /**
   * Refresh token уходит только в cookie и никогда в тело ответа —
   * иначе его смог бы прочитать JavaScript, что сводит на нет HttpOnly.
   */
  private respondWithSession(result: AuthResult, reply: FastifyReply) {
    reply.setCookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: result.refreshTokenExpiresAt,
    });

    return {
      user: result.user,
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
    };
  }
}

function sessionContext(request: AuthenticatedRequest) {
  return {
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  };
}

function readRefreshCookie(request: AuthenticatedRequest): string | undefined {
  const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME];
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

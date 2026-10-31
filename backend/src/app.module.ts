import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AppThrottlerGuard } from './common/app-throttler.guard';
import { validateEnv } from './common/config/env.schema';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Общий лимит плюс именованный профиль `auth`, который контроллер
    // авторизации ужесточает декоратором @Throttle на каждом маршруте.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', limit: 120, ttl: 60_000 },
        { name: 'auth', limit: 10, ttl: 60_000 },
      ],
    }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    // Порядок важен: сначала аутентификация, затем проверка ролей.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

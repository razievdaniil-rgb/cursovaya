import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { RecoveryDeliveryService } from './recovery-delivery.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { TokensService } from './tokens.service';

@Module({
  // Секреты передаются в каждый вызов sign/verify явно (TokensService),
  // поэтому глобальная регистрация секрета здесь не нужна.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [RecoveryDeliveryService, AuthService, PasswordService, TokensService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, TokensService, PasswordService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

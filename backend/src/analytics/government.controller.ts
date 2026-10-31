import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ROLE } from '../auth/auth.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  syncQuerySchema,
  syncRunIdSchema,
  syncRunSchema,
  type SyncQueryInput,
  type SyncRunInput,
} from '../sync/sync.schema';
import { SyncService } from '../sync/sync.service';
import { analyticsQuerySchema, type AnalyticsQueryInput } from './analytics.schema';
import { AnalyticsService } from './analytics.service';

/**
 * Государственный раздел. Роль `government` не выдаётся самостоятельной
 * регистрацией (ADR 0005), поэтому доступ сюда получает только пользователь,
 * которому её назначил администратор платформы.
 */
@ApiTags('government')
@ApiBearerAuth()
@Roles(ROLE.government, ROLE.admin)
@Controller('government')
export class GovernmentController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly sync: SyncService,
  ) {}

  @Get('analytics')
  @ApiOperation({
    summary: 'Аналитические показатели',
    description:
      'Читаются из materialized views. Поле refreshedAt показывает, когда ' +
      'кэш был обновлён последний раз.',
  })
  async snapshot(
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQueryInput,
  ) {
    return this.analytics.getSnapshot(query);
  }

  @Post('analytics/refresh')
  @ApiOperation({ summary: 'Обновить кэш аналитики' })
  async refresh() {
    return this.analytics.refresh();
  }

  @Get('problem-products')
  @ApiOperation({
    summary: 'Проблемные изделия',
    description:
      'Истекающая или приостановленная регистрация, критические отзывы, ' +
      'отсутствие действующих предложений. Критерии вычисляются запросом.',
  })
  async problemProducts() {
    return this.analytics.getProblemProducts();
  }

  @Get('sync')
  @ApiOperation({
    summary: 'Журнал загрузок',
    description:
      'source.isReal = false означает, что внешний государственный реестр ' +
      'не подключён и данные демонстрационные.',
  })
  async syncStatus(
    @Query(new ZodValidationPipe(syncQuerySchema)) query: SyncQueryInput,
  ) {
    return this.sync.getStatus(query);
  }

  @Get('sync/runs/:runId/errors')
  @ApiOperation({ summary: 'Ошибки конкретного запуска загрузки' })
  async runErrors(
    @Param(new ZodValidationPipe(syncRunIdSchema)) params: { runId: string },
  ) {
    return this.sync.getRunErrors(params.runId);
  }

  @Post('sync/run')
  @ApiOperation({
    summary: 'Запустить загрузку из демонстрационного источника',
    description:
      'Создаёт запуск MockRegistryProvider. Ответ содержит ' +
      'source.isReal = false: запуск не выдаётся за обращение к реальному API.',
  })
  async runSync(
    @Body(new ZodValidationPipe(syncRunSchema)) input: SyncRunInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sync.run(user.id, input);
  }
}

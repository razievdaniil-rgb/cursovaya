import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ROLE } from '../auth/auth.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.guard';
import { ApiProblemResponse, ApiZodBody, ApiZodQuery } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { productReviewsQuerySchema, type ProductReviewsQueryInput } from '../products/products.schema';
import {
  registryRunSchema,
  syncQuerySchema,
  syncRunIdSchema,
  syncRunSchema,
  type SyncQueryInput,
  type RegistryRunInput,
  type SyncRunInput,
} from '../sync/sync.schema';
import { NomenclatureSyncService } from '../sync/nomenclature/nomenclature-sync.service';
import { RegistrySyncService } from '../sync/registry/registry-sync.service';
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
    private readonly nomenclatureSync: NomenclatureSyncService,
    private readonly registrySync: RegistrySyncService,
  ) {}

  @Get('analytics')
  @ApiZodQuery(analyticsQuerySchema)
  @ApiProblemResponse(403, 'Требуется роль government')
  @ApiProblemResponse(422, 'Некорректный период или идентификатор категории')
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
  @ApiZodQuery(productReviewsQuerySchema)
  @ApiOperation({
    summary: 'Проблемные изделия',
    description:
      'Истекающая или приостановленная регистрация, критические отзывы, ' +
      'отсутствие действующих предложений. Критерии вычисляются запросом.',
  })
  async problemProducts(@Query(new ZodValidationPipe(productReviewsQuerySchema)) query: ProductReviewsQueryInput) {
    return this.analytics.getProblemProducts(query);
  }

  @Get('sync')
  @ApiZodQuery(syncQuerySchema)
  @ApiProblemResponse(403, 'Требуется роль government')
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

  @Post('sync/registry/run')
  @HttpCode(202)
  @ApiZodBody(registryRunSchema)
  @ApiProblemResponse(403, 'Требуется роль government')
  @ApiProblemResponse(502, 'Реестр недоступен')
  @ApiOperation({
    summary: 'Загрузить государственный реестр медицинских изделий',
    description:
      'Настоящий источник: публичный REST API Росздравнадзора. В ответе ' +
      'source.isReal = true. Параметр maxPages ограничивает объём загрузки.',
  })
  async runRegistrySync(
    @Body(new ZodValidationPipe(registryRunSchema)) input: RegistryRunInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.registrySync.start(user.id, input);
  }

  @Post('sync/nomenclature/run')
  @ApiProblemResponse(403, 'Требуется роль government')
  @ApiProblemResponse(502, 'Источник открытых данных недоступен')
  @ApiOperation({
    summary: 'Загрузить номенклатурную классификацию из открытых данных',
    description:
      'Настоящий источник: публичный набор Росздравнадзора. В ответе ' +
      'source.isReal = true — в отличие от демонстрационного реестра изделий. ' +
      'Расхождения источника с его схемой попадают в журнал загрузок.',
  })
  async runNomenclatureSync(@CurrentUser() user: RequestUser) {
    return this.nomenclatureSync.run(user.id);
  }

  @Get('sync/runs/:runId/errors')
  @ApiOperation({ summary: 'Ошибки конкретного запуска загрузки' })
  async runErrors(
    @Param(new ZodValidationPipe(syncRunIdSchema)) params: { runId: string },
  ) {
    return this.sync.getRunErrors(params.runId);
  }

  @Post('sync/run')
  @ApiZodBody(syncRunSchema)
  @ApiProblemResponse(403, 'Требуется роль government')
  @ApiProblemResponse(409, 'Источник данных отключён')
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

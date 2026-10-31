import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  comparisonIdSchema,
  comparisonItemParamsSchema,
  createComparisonSchema,
  updateComparisonSchema,
  type CreateComparisonInput,
  type UpdateComparisonInput,
} from './comparisons.schema';
import { ComparisonsService } from './comparisons.service';

@ApiTags('comparisons')
@ApiBearerAuth()
@Controller('comparisons')
export class ComparisonsController {
  constructor(private readonly comparisons: ComparisonsService) {}

  @Get()
  @ApiOperation({ summary: 'Мои сравнения' })
  async list(@CurrentUser() user: RequestUser) {
    return this.comparisons.findMine(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать сравнение' })
  async create(
    @Body(new ZodValidationPipe(createComparisonSchema)) input: CreateComparisonInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.comparisons.create(user.id, input);
  }

  @Get(':comparisonId')
  @ApiOperation({
    summary: 'Сравнение с матрицей характеристик',
    description:
      'comparableCharacteristics содержит по строке на характеристику с ' +
      'пометкой is_comparable и значением каждого изделия.',
  })
  async detail(
    @Param(new ZodValidationPipe(comparisonIdSchema)) params: { comparisonId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.comparisons.findOne(params.comparisonId, user.id);
  }

  @Patch(':comparisonId')
  @ApiOperation({ summary: 'Переименовать сравнение' })
  async update(
    @Param(new ZodValidationPipe(comparisonIdSchema)) params: { comparisonId: string },
    @Body(new ZodValidationPipe(updateComparisonSchema)) input: UpdateComparisonInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.comparisons.update(params.comparisonId, user.id, input);
  }

  @Delete(':comparisonId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Удалить сравнение' })
  async remove(
    @Param(new ZodValidationPipe(comparisonIdSchema)) params: { comparisonId: string },
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.comparisons.remove(params.comparisonId, user.id);
  }

  @Post(':comparisonId/products/:productId')
  @ApiOperation({
    summary: 'Добавить изделие в сравнение',
    description:
      'Не более трёх изделий. Добавление выполняется в транзакции с ' +
      'блокировкой строки сравнения, поэтому конкурентные запросы не могут ' +
      'превысить лимит.',
  })
  async addProduct(
    @Param(new ZodValidationPipe(comparisonItemParamsSchema))
    params: { comparisonId: string; productId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.comparisons.addProduct(params.comparisonId, params.productId, user.id);
  }

  @Delete(':comparisonId/products/:productId')
  @ApiOperation({ summary: 'Убрать изделие из сравнения' })
  async removeProduct(
    @Param(new ZodValidationPipe(comparisonItemParamsSchema))
    params: { comparisonId: string; productId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.comparisons.removeProduct(
      params.comparisonId,
      params.productId,
      user.id,
    );
  }
}

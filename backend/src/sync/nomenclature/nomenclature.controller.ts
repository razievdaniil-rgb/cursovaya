import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/jwt-auth.guard';
import { ApiProblemResponse, ApiZodQuery } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  nomenclatureCodeSchema,
  nomenclatureQuerySchema,
  type NomenclatureQueryInput,
} from './nomenclature.schema';
import { NomenclatureService } from './nomenclature.service';

/**
 * Номенклатурная классификация медицинских изделий по видам.
 *
 * Данные загружаются из открытых данных Росздравнадзора (ADR 0009) — это
 * настоящий внешний источник, в отличие от демонстрационного реестра изделий.
 * Классификация публичная, поэтому эндпоинты открыты без авторизации.
 */
@ApiTags('nomenclature')
@Controller('nomenclature')
export class NomenclatureController {
  constructor(private readonly nomenclature: NomenclatureService) {}

  @Public()
  @Get()
  @ApiZodQuery(nomenclatureQuerySchema)
  @ApiProblemResponse(422, 'Некорректные параметры запроса')
  @ApiOperation({
    summary: 'Виды медицинских изделий',
    description:
      'Поиск по названию, описанию и коду. Фильтр sectionNumber включает ' +
      'подразделы: «12.08» вернёт и «12.08.05».',
  })
  async list(
    @Query(new ZodValidationPipe(nomenclatureQuerySchema)) query: NomenclatureQueryInput,
  ) {
    return this.nomenclature.findTypes(query);
  }

  @Public()
  @Get('summary')
  @ApiOperation({
    summary: 'Сводка по классификации и последней загрузке',
  })
  async summary() {
    return this.nomenclature.getSummary();
  }

  @Public()
  @Get('sections')
  @ApiOperation({
    summary: 'Дерево разделов классификации',
    description: 'Разделы возвращаются деревом; вложенность задана parent_id.',
  })
  async sections() {
    return this.nomenclature.getSectionTree();
  }

  @Public()
  @Get(':code')
  @ApiProblemResponse(404, 'Вид медицинского изделия не найден')
  @ApiProblemResponse(422, 'Некорректный код вида')
  @ApiOperation({
    summary: 'Вид по коду классификации',
    description:
      'sectionPaths содержит полные пути разделов, восстановленные обходом ' +
      'дерева: в базе хранится только самый глубокий раздел каждого пути.',
  })
  async detail(
    @Param(new ZodValidationPipe(nomenclatureCodeSchema)) params: { code: number },
  ) {
    return this.nomenclature.findTypeByCode(params.code);
  }
}

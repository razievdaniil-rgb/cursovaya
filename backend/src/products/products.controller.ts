import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  catalogQuerySchema,
  productIdSchema,
  productReviewsQuerySchema,
  type CatalogQueryInput,
  type ProductReviewsQueryInput,
} from './products.schema';
import { ProductsService } from './products.service';

/**
 * Каталог открыт без авторизации: просмотр реестра не требует входа, а
 * персональных данных в ответах нет. Отзывы отдаются только опубликованные.
 */
@ApiTags('catalog')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Список изделий',
    description:
      'Фильтры: search, categorySlug, categoryId, manufacturerId, countryIso2, ' +
      'status, riskClass, originType, priceMin, priceMax. Пагинация page/limit. ' +
      'Повторяющиеся параметры и значения через запятую равнозначны.',
  })
  async list(
    @Query(new ZodValidationPipe(catalogQuerySchema)) query: CatalogQueryInput,
  ) {
    return this.products.findMany(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Карточка изделия',
    description:
      'Характеристики возвращаются типизированными значениями с единицей ' +
      'измерения, а не единым JSON-объектом.',
  })
  async detail(@Param(new ZodValidationPipe(productIdSchema)) params: { id: string }) {
    return this.products.findOne(params.id);
  }

  @Public()
  @Get(':id/analogues')
  @ApiOperation({ summary: 'Аналоги изделия' })
  async analogues(
    @Param(new ZodValidationPipe(productIdSchema)) params: { id: string },
  ) {
    return this.products.findAnalogues(params.id);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({
    summary: 'Опубликованные отзывы изделия',
    description:
      'Бейдж verifiedOrganization вычисляется из текущего статуса верификации ' +
      'организации автора.',
  })
  async reviews(
    @Param(new ZodValidationPipe(productIdSchema)) params: { id: string },
    @Query(new ZodValidationPipe(productReviewsQuerySchema))
    query: ProductReviewsQueryInput,
  ) {
    return this.products.findReviews(params.id, query);
  }

  @Public()
  @Get(':id/documents')
  @ApiOperation({ summary: 'Документы изделия' })
  async documents(
    @Param(new ZodValidationPipe(productIdSchema)) params: { id: string },
  ) {
    return this.products.findDocuments(params.id);
  }
}

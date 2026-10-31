import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ROLE } from '../auth/auth.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { productIdSchema } from '../products/products.schema';
import {
  createReviewSchema,
  moderateReviewSchema,
  myReviewsQuerySchema,
  reviewIdSchema,
  type CreateReviewInput,
  type ModerateReviewInput,
  type MyReviewsQueryInput,
} from './reviews.schema';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('products/:id/reviews')
  @ApiOperation({
    summary: 'Создать отзыв',
    description:
      'Отзыв создаётся в статусе moderation. Статус и бейдж подтверждённой ' +
      'организации от клиента не принимаются.',
  })
  async create(
    @Param(new ZodValidationPipe(productIdSchema)) params: { id: string },
    @Body(new ZodValidationPipe(createReviewSchema)) input: CreateReviewInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviews.create(params.id, user.id, input);
  }

  @Get('me/reviews')
  @ApiOperation({ summary: 'Мои отзывы, включая находящиеся на модерации' })
  async mine(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(myReviewsQuerySchema)) query: MyReviewsQueryInput,
  ) {
    return this.reviews.findMine(user.id, query);
  }

  @Get('admin/reviews')
  @Roles(ROLE.admin)
  @ApiOperation({ summary: 'Очередь модерации' })
  async queue(
    @Query(new ZodValidationPipe(myReviewsQuerySchema)) query: MyReviewsQueryInput,
  ) {
    return this.reviews.findForModeration(query);
  }

  @Patch('admin/reviews/:id/status')
  @Roles(ROLE.admin)
  @ApiOperation({
    summary: 'Сменить статус отзыва',
    description:
      'Обновление статуса и запись в review_moderation_events выполняются ' +
      'одной транзакцией.',
  })
  async moderate(
    @Param(new ZodValidationPipe(reviewIdSchema)) params: { id: string },
    @Body(new ZodValidationPipe(moderateReviewSchema)) input: ModerateReviewInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reviews.moderate(params.id, user.id, input);
  }

  @Get('admin/reviews/:id/history')
  @Roles(ROLE.admin)
  @ApiOperation({ summary: 'История модерации отзыва' })
  async history(
    @Param(new ZodValidationPipe(reviewIdSchema)) params: { id: string },
  ) {
    return this.reviews.findModerationHistory(params.id);
  }
}

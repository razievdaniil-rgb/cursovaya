import { Injectable } from '@nestjs/common';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateReviewInput,
  ModerateReviewInput,
  MyReviewsQueryInput,
} from './reviews.schema';

/**
 * Отзывы и модерация.
 *
 * Новый отзыв всегда попадает в статус `moderation`: статус не принимается от
 * клиента. Переход между статусами выполняется транзакцией, которая
 * одновременно пишет событие в review_moderation_events, — история модерации
 * не перезаписывается.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(productId: string, userId: string, input: CreateReviewInput) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw Problems.notFound('Изделие');

    const existing = await this.prisma.review.findUnique({
      where: { productId_authorUserId: { productId, authorUserId: userId } },
      select: { id: true },
    });
    if (existing) throw Problems.reviewAlreadyExists();

    const experience = await this.prisma.reviewExperiencePeriod.findUnique({
      where: { code: input.experience },
      select: { id: true },
    });
    if (!experience) {
      throw Problems.validationFailed({
        experience: ['Неизвестный срок использования'],
      });
    }

    // Отзыв от имени организации возможен только при подтверждённом членстве.
    if (input.organizationId) {
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId,
          },
        },
        select: { organizationId: true },
      });
      if (!membership) throw Problems.notOrganizationMember();
    }

    const moderationStatus = await this.prisma.reviewStatus.findUniqueOrThrow({
      where: { code: 'moderation' },
      select: { id: true },
    });

    const review = await this.prisma.review.create({
      data: {
        productId,
        authorUserId: userId,
        authorOrganizationId: input.organizationId ?? null,
        experiencePeriodId: experience.id,
        reviewStatusId: moderationStatus.id,
        rating: input.rating,
        title: input.title,
        body: input.body,
        // Статус `moderation` не публикуется, поэтому даты публикации нет.
        publishedAt: null,
      },
      select: { id: true },
    });

    return this.findOne(review.id);
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        reviewStatus: { select: { code: true, name: true } },
        experiencePeriod: { select: { code: true, name: true } },
        authorUser: { select: { id: true, displayName: true } },
        authorOrganization: {
          select: {
            id: true,
            name: true,
            shortName: true,
            verificationStatus: { select: { code: true } },
          },
        },
        product: { select: { id: true, name: true, shortName: true } },
      },
    });

    if (!review) throw Problems.notFound('Отзыв');

    return {
      id: review.id,
      productId: review.productId,
      product: review.product,
      rating: review.rating,
      title: review.title,
      body: review.body,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      publishedAt: review.publishedAt,
      status: review.reviewStatus.code,
      statusName: review.reviewStatus.name,
      experience: review.experiencePeriod,
      author: {
        displayName: review.authorOrganization
          ? (review.authorOrganization.shortName ?? review.authorOrganization.name)
          : review.authorUser.displayName,
        type: review.authorOrganization ? 'organization' : 'user',
      },
      organization: review.authorOrganization
        ? {
            id: review.authorOrganization.id,
            name: review.authorOrganization.name,
            shortName: review.authorOrganization.shortName,
            verificationStatus: review.authorOrganization.verificationStatus.code,
          }
        : null,
      // Вычисляется, а не хранится (ADR 0003).
      verifiedOrganization:
        review.authorOrganization?.verificationStatus.code === 'verified',
    };
  }

  async findMine(userId: string, query: MyReviewsQueryInput) {
    const where = {
      authorUserId: userId,
      ...(query.status ? { reviewStatus: { code: query.status } } : {}),
    };

    const offset = (query.page - 1) * query.limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: query.limit,
        select: { id: true },
      }),
      this.prisma.review.count({ where }),
    ]);

    const detailed = await Promise.all(
      reviews.map((review) => this.findOne(review.id)),
    );

    return {
      data: detailed,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  /**
   * Смена статуса отзыва модератором.
   *
   * Обновление отзыва и запись события идут одной транзакцией: иначе история
   * модерации могла бы разойтись с текущим статусом. `published_at`
   * выставляется и снимается здесь же — строчный CHECK не может сверить дату
   * со справочником статусов (см. backend/docs/database.md).
   */
  async moderate(reviewId: string, moderatorUserId: string, input: ModerateReviewInput) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({
        where: { id: reviewId },
        select: {
          id: true,
          reviewStatusId: true,
          publishedAt: true,
          reviewStatus: { select: { code: true } },
        },
      });
      if (!review) throw Problems.notFound('Отзыв');

      const target = await tx.reviewStatus.findUnique({
        where: { code: input.status },
        select: { id: true, code: true },
      });
      if (!target) {
        throw Problems.validationFailed({ status: ['Неизвестный статус отзыва'] });
      }

      if (target.id === review.reviewStatusId) {
        throw Problems.reviewStatusUnchanged(review.reviewStatus.code);
      }

      await tx.review.update({
        where: { id: reviewId },
        data: {
          reviewStatusId: target.id,
          // Дата публикации проставляется один раз и снимается при уходе
          // из статуса published.
          publishedAt:
            target.code === 'published' ? (review.publishedAt ?? new Date()) : null,
        },
      });

      await tx.reviewModerationEvent.create({
        data: {
          reviewId,
          moderatorUserId,
          fromStatusId: review.reviewStatusId,
          toStatusId: target.id,
          comment: input.comment ?? null,
        },
      });

      return reviewId;
    }).then((id) => this.findOne(id));
  }

  async findModerationHistory(reviewId: string) {
    const events = await this.prisma.reviewModerationEvent.findMany({
      where: { reviewId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        comment: true,
        createdAt: true,
        moderator: { select: { id: true, displayName: true } },
        fromStatus: { select: { code: true, name: true } },
        toStatus: { select: { code: true, name: true } },
      },
    });

    return events.map((event) => ({
      id: event.id,
      comment: event.comment,
      createdAt: event.createdAt,
      moderator: event.moderator,
      from: event.fromStatus,
      to: event.toStatus,
    }));
  }

  /** Очередь модерации для администратора. */
  async findForModeration(query: MyReviewsQueryInput) {
    const where = query.status ? { reviewStatus: { code: query.status } } : {};
    const offset = (query.page - 1) * query.limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: query.limit,
        select: { id: true },
      }),
      this.prisma.review.count({ where }),
    ]);

    const detailed = await Promise.all(
      reviews.map((review) => this.findOne(review.id)),
    );

    return {
      data: detailed,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }
}

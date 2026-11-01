import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5'),
  title: z.string().trim().min(3, 'Укажите заголовок').max(255),
  body: z.string().trim().min(10, 'Отзыв слишком короткий').max(8000),
  /** Код из review_experience_periods. */
  experience: z.string().trim().min(1, 'Укажите срок использования'),
  /**
   * Отзыв от имени организации. Членство проверяется сервером; бейдж
   * «подтверждённая организация» не принимается от клиента, а вычисляется
   * из статуса верификации этой организации.
   */
  organizationId: z.string().uuid().optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/** Статусы, в которые модератор может перевести отзыв. */
export const moderationTargetStatuses = [
  'published',
  'rejected',
  'hidden',
  'moderation',
] as const;

export const moderateReviewSchema = z.object({
  status: z.enum(moderationTargetStatuses),
  comment: z.string().trim().max(1024).optional(),
});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const myReviewsQuerySchema = z.object({
  status: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type MyReviewsQueryInput = z.infer<typeof myReviewsQuerySchema>;

export const reviewIdSchema = z.object({
  id: z.string().uuid('Ожидается UUID отзыва'),
});

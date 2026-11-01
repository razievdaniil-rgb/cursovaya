import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type NotificationsQueryInput = z.infer<typeof notificationsQuerySchema>;

export const notificationIdSchema = z.object({
  id: z.string().uuid('Ожидается UUID уведомления'),
});

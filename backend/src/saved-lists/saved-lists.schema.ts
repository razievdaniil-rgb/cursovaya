import { z } from 'zod';

export const createSavedListSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название списка').max(255),
  /** Список организации; членство проверяется сервером. */
  organizationId: z.string().uuid().optional(),
});

export type CreateSavedListInput = z.infer<typeof createSavedListSchema>;

export const updateSavedListSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  /** null отвязывает список от организации. */
  organizationId: z.string().uuid().nullable().optional(),
});

export type UpdateSavedListInput = z.infer<typeof updateSavedListSchema>;

export const savedListIdSchema = z.object({
  listId: z.string().uuid('Ожидается UUID списка'),
});

export const savedListItemParamsSchema = z.object({
  listId: z.string().uuid('Ожидается UUID списка'),
  productId: z.string().uuid('Ожидается UUID изделия'),
});

import { z } from 'zod';

export const createComparisonSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
});

export type CreateComparisonInput = z.infer<typeof createComparisonSchema>;

export const updateComparisonSchema = z.object({
  name: z.string().trim().min(1).max(255).nullable().optional(),
});

export type UpdateComparisonInput = z.infer<typeof updateComparisonSchema>;

export const comparisonIdSchema = z.object({
  comparisonId: z.string().uuid('Ожидается UUID сравнения'),
});

export const comparisonItemParamsSchema = z.object({
  comparisonId: z.string().uuid('Ожидается UUID сравнения'),
  productId: z.string().uuid('Ожидается UUID изделия'),
});

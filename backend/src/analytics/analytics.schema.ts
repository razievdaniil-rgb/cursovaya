import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  /** Год, начиная с которого показывать динамику. */
  period: z
    .string()
    .regex(/^\d{4}$/, 'Период указывается годом, например 2024')
    .optional(),
  categoryId: z.string().uuid('Ожидается UUID категории').optional(),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;

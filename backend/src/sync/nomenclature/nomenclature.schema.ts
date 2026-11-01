import { z } from 'zod';

export const nomenclatureQuerySchema = z.object({
  /** Поиск по названию, описанию или коду вида. */
  search: z.string().trim().max(256).optional(),
  /** Номер раздела: включает подразделы («12.08» вернёт и «12.08.05»). */
  sectionNumber: z
    .string()
    .trim()
    .regex(/^[\d.]{1,32}$/, 'Номер раздела состоит из цифр и точек')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type NomenclatureQueryInput = z.infer<typeof nomenclatureQuerySchema>;

export const nomenclatureCodeSchema = z.object({
  code: z.coerce.number().int().positive('Код вида — положительное целое число'),
});

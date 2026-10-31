import { z } from 'zod';

export const syncQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SyncQueryInput = z.infer<typeof syncQuerySchema>;

export const syncRunSchema = z.object({
  /**
   * Сценарий демонстрационного источника. Нужен, чтобы в журнале загрузок
   * можно было увидеть состояния partial и failed, которые показывает
   * интерфейс. На реальный источник не влияет — его нет (ADR 0008).
   */
  scenario: z.enum(['success', 'partial', 'failed']).default('success'),
});

export type SyncRunInput = z.infer<typeof syncRunSchema>;

export const syncRunIdSchema = z.object({
  runId: z.string().uuid('Ожидается UUID запуска'),
});

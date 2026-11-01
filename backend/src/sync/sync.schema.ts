import { z } from 'zod';

export const syncQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  source: z.enum(['mock-registry', 'roszdravnadzor-registry', 'roszdravnadzor-nomenclature']).optional(),
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

/**
 * Параметры загрузки реестра.
 *
 * В реестре более 80 000 записей, поэтому полезно уметь ограничить объём:
 * maxPages нужен для проверок и первичной загрузки по частям.
 */
export const registryRunSchema = z.object({
  pageSize: z.coerce.number().int().positive().max(1000).default(500),
  maxPages: z.coerce.number().int().positive().max(1000).optional(),
});

export type RegistryRunInput = z.infer<typeof registryRunSchema>;

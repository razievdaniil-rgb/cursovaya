import { defineConfig } from 'vitest/config';

import { sharedTestOptions, swcPlugin } from './vitest.shared';

/**
 * Только integration-тесты: требуют поднятой PostgreSQL с применёнными
 * миграциями и seed.
 *
 * Набор задаётся шаблоном каталога, а не перечислением файлов: иначе новый
 * spec молча не попадал бы в прогон CI.
 */
export default defineConfig({
  test: {
    ...sharedTestOptions,
    include: ['test/*.spec.ts'],
    // Все файлы работают с одной базой, поэтому идут по одному.
    fileParallelism: false,
  },
  plugins: [swcPlugin],
});

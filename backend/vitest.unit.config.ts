import { defineConfig } from 'vitest/config';

import { sharedTestOptions, swcPlugin } from './vitest.shared';

/**
 * Только unit-тесты: база данных и переменные окружения приложения не нужны,
 * поэтому набор прогоняется на любой машине без PostgreSQL.
 */
export default defineConfig({
  test: {
    ...sharedTestOptions,
    include: ['test/unit/**/*.spec.ts'],
    // Общего состояния у них нет, можно параллельно.
    fileParallelism: true,
  },
  plugins: [swcPlugin],
});

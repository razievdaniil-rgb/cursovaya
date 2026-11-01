import { defineConfig } from 'vitest/config';

import { sharedTestOptions, swcPlugin } from './vitest.shared';

/**
 * Полный прогон: unit и integration вместе. Integration-тестам нужна
 * поднятая PostgreSQL с применёнными миграциями и seed.
 */
export default defineConfig({
  test: {
    ...sharedTestOptions,
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    // Integration-тесты делят одну базу, поэтому файлы идут последовательно.
    fileParallelism: false,
  },
  plugins: [swcPlugin],
});

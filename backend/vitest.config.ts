import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    // Integration-тесты делят одну базу, поэтому выполняются последовательно.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  plugins: [
    // Vitest по умолчанию трансформирует через esbuild, который не умеет
    // emitDecoratorMetadata. Без неё NestJS не видит типы зависимостей и
    // внедряет undefined. SWC эту метаданную генерирует.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
  ],
});

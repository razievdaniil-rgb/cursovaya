import swc from 'unplugin-swc';
import type { UserConfig } from 'vitest/config';

/**
 * Общая часть конфигураций vitest.
 *
 * `include` сюда намеренно не входит: mergeConfig склеивает массивы, а не
 * заменяет их, из-за чего unit-конфигурация подхватывала бы и
 * integration-тесты. Каждый набор задаёт свой include сам.
 */
export const swcPlugin = swc.vite({
  module: { type: 'es6' },
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    // Без decoratorMetadata NestJS не видит типы зависимостей: esbuild,
    // которым vitest трансформирует по умолчанию, её не генерирует.
    transform: { decoratorMetadata: true, legacyDecorator: true },
  },
});

export const sharedTestOptions: UserConfig['test'] = {
  globals: true,
  environment: 'node',
  testTimeout: 30_000,
  hookTimeout: 60_000,
};

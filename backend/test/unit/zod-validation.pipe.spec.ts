/**
 * Unit-тесты валидации входных данных и формата ошибок RFC 9457.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ProblemException } from '../../src/common/problem';
import { ZodValidationPipe } from '../../src/common/zod-validation.pipe';

const schema = z.object({
  email: z.string().email('Некорректный адрес'),
  age: z.coerce.number().int().min(18, 'Только для совершеннолетних'),
  nested: z.object({ code: z.string().min(2, 'Слишком короткий код') }).optional(),
});

const pipe = new ZodValidationPipe(schema);

describe('ZodValidationPipe', () => {
  it('пропускает корректные данные и применяет преобразования', () => {
    const result = pipe.transform({ email: 'user@example.com', age: '42' });

    // z.coerce превращает строку запроса в число.
    expect(result).toEqual({ email: 'user@example.com', age: 42 });
  });

  it('бросает Problem Details со статусом 422', () => {
    expect(() => pipe.transform({ email: 'не-почта', age: '10' })).toThrow(ProblemException);

    try {
      pipe.transform({ email: 'не-почта', age: '10' });
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      const problem = (error as ProblemException).problem;
      expect(problem.status).toBe(422);
      expect(problem.type).toBe('https://medizdeliya.local/problems/validation-failed');
      expect(problem.errors).toEqual({
        email: ['Некорректный адрес'],
        age: ['Только для совершеннолетних'],
      });
    }
  });

  it('склеивает путь вложенного поля точкой', () => {
    try {
      pipe.transform({ email: 'user@example.com', age: '20', nested: { code: 'x' } });
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      const problem = (error as ProblemException).problem;
      expect(problem.errors).toEqual({ 'nested.code': ['Слишком короткий код'] });
    }
  });

  it('собирает несколько сообщений одного поля', () => {
    const strict = new ZodValidationPipe(
      z.object({
        password: z
          .string()
          .min(10, 'Не короче 10 символов')
          .regex(/[0-9]/, 'Нужна хотя бы одна цифра'),
      }),
    );

    try {
      strict.transform({ password: 'короткий' });
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      const problem = (error as ProblemException).problem;
      expect(problem.errors).toEqual({
        password: ['Не короче 10 символов', 'Нужна хотя бы одна цифра'],
      });
    }
  });

  it('обозначает ошибку корня как (root)', () => {
    const arrayPipe = new ZodValidationPipe(z.array(z.string()));

    try {
      arrayPipe.transform('не массив');
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      const problem = (error as ProblemException).problem;
      expect(Object.keys(problem.errors as object)).toEqual(['(root)']);
    }
  });
});

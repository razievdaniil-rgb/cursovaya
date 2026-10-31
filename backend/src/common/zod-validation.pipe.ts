import { PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';

import { Problems } from './problem';

/**
 * Единственный способ валидации входных данных (ADR 0004).
 * Применяется точечно: `@Body(new ZodValidationPipe(schema))`.
 *
 * Тип входа схемы намеренно не фиксируется: у схем с `.default()`,
 * `.transform()` и `.refine()` вход и выход различаются (например, `page`
 * во входе необязателен, а на выходе — всегда число). Pipe получает
 * непроверенные данные запроса, поэтому вход для него и есть `unknown`.
 */
export class ZodValidationPipe<TOutput, TInput = unknown>
  implements PipeTransform<unknown, TOutput>
{
  constructor(
    private readonly schema: ZodType<TOutput, ZodTypeDef, TInput>,
  ) {}

  transform(value: unknown): TOutput {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw Problems.validationFailed(flattenIssues(error));
      }
      throw error;
    }
  }
}

function flattenIssues(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    (errors[path] ??= []).push(issue.message);
  }

  return errors;
}

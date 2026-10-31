import { PipeTransform } from '@nestjs/common';
import { ZodError, type ZodType } from 'zod';

import { Problems } from './problem';

/**
 * Единственный способ валидации входных данных (ADR 0004).
 * Применяется точечно: `@Body(new ZodValidationPipe(schema))`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
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

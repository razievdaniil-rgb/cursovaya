import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Описание запросов в OpenAPI из тех же схем Zod, которыми выполняется
 * валидация (ADR 0004).
 *
 * Иначе документация и проверка разошлись бы: декораторы Swagger описывали
 * бы одно, а сервер принимал другое.
 */

/**
 * Узкая подпись конвертера.
 *
 * Собственные типы zod-to-json-schema параметризованы по всей структуре
 * схемы. На схемах с `.refine()` и вложенными объектами вывод уходит в
 * глубину настолько, что компилятор падает по памяти, поэтому генерики здесь
 * сознательно стираются: на входе всё равно всегда схема Zod, а на выходе —
 * JSON Schema, которую дальше проверяет сам Swagger.
 */
const convertToJsonSchema = zodToJsonSchema as unknown as (
  schema: unknown,
  options?: Record<string, unknown>,
) => Record<string, unknown>;

function toJsonSchema(schema: ZodTypeAny): SchemaObject {
  const converted = convertToJsonSchema(schema, {
    // Ссылки $ref не нужны: схема встраивается в описание операции целиком.
    $refStrategy: 'none',
    target: 'openApi3',
  });

  // zod-to-json-schema добавляет $schema, которого в OpenAPI быть не должно.
  const { $schema: _ignored, ...rest } = converted;
  return rest as SchemaObject;
}

/** Тело запроса, описанное схемой Zod. */
export function ApiZodBody(schema: ZodTypeAny, description?: string) {
  return applyDecorators(
    ApiBody({ schema: toJsonSchema(schema), ...(description ? { description } : {}) }),
  );
}

/**
 * Query-параметры, описанные схемой Zod.
 *
 * Объектная схема разбирается на отдельные параметры: в OpenAPI query
 * описывается по одному полю, а не единым объектом.
 */
export function ApiZodQuery(schema: ZodTypeAny) {
  const jsonSchema = toJsonSchema(schema);
  const properties = (jsonSchema.properties ?? {}) as Record<string, SchemaObject>;
  const required = new Set((jsonSchema.required ?? []) as string[]);

  const decorators = Object.entries(properties).map(([name, property]) =>
    ApiQuery({
      name,
      required: required.has(name),
      schema: property,
      ...(property.description ? { description: property.description } : {}),
    }),
  );

  return applyDecorators(...decorators);
}

/** Стандартный ответ с ошибкой в формате RFC 9457. */
export function ApiProblemResponse(status: number, description: string) {
  return ApiResponse({
    status,
    description,
    content: {
      'application/problem+json': {
        schema: {
          type: 'object',
          required: ['type', 'title', 'status'],
          properties: {
            type: {
              type: 'string',
              format: 'uri',
              example: 'https://medizdeliya.local/problems/validation-failed',
            },
            title: { type: 'string', example: 'Некорректные данные запроса' },
            status: { type: 'integer', example: status },
            detail: { type: 'string' },
            instance: { type: 'string' },
            requestId: { type: 'string', format: 'uuid' },
            errors: {
              type: 'object',
              description: 'Сообщения по полям; присутствует при 422.',
              additionalProperties: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  });
}

/** Успешный ответ в общей обёртке `{ data }`. */
export function ApiEnvelopeResponse(options: {
  status?: number;
  description: string;
  data: SchemaObject;
  withMeta?: boolean;
}) {
  const properties: Record<string, SchemaObject> = { data: options.data };

  if (options.withMeta) {
    properties.meta = {
      type: 'object',
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 4 },
        totalPages: { type: 'integer', example: 1 },
      },
    };
  }

  return ApiResponse({
    status: options.status ?? 200,
    description: options.description,
    schema: { type: 'object', required: ['data'], properties },
  });
}

export { ApiExtraModels };

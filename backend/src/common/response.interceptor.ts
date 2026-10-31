import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Единая обёртка успешных ответов: `{ data, meta? }`.
 *
 * Если сервис вернул объект с полем `meta` (пагинация, `refreshedAt`), оно
 * поднимается на верхний уровень, а полезная нагрузка остаётся в `data`.
 * Ошибки сюда не попадают — ими занимается ProblemDetailsFilter.
 */
export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface PayloadWithMeta {
  data: unknown;
  meta: Record<string, unknown>;
}

function hasMeta(value: unknown): value is PayloadWithMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    typeof (value as PayloadWithMeta).meta === 'object'
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiEnvelope<unknown>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiEnvelope<unknown>> {
    return next.handle().pipe(
      map((payload) =>
        hasMeta(payload)
          ? { data: payload.data, meta: payload.meta }
          : { data: payload },
      ),
    );
  }
}

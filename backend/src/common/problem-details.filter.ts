import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { PROBLEM_TYPE_PREFIX, ProblemException, type ProblemBody } from './problem';

/**
 * Любая ошибка уходит клиенту в формате RFC 9457 с Content-Type
 * `application/problem+json`. Детали ошибок БД и стеки наружу не попадают.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();

    const body = this.toProblem(exception, request);

    if (body.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${body.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    void reply
      .status(body.status)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(body);
  }

  private toProblem(exception: unknown, request: FastifyRequest): ProblemBody {
    const instance = request.url;
    const requestId = request.id;

    if (exception instanceof ProblemException) {
      return { ...exception.problem, instance, requestId };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : typeof response === 'object' && response !== null
            ? ((response as { message?: unknown }).message as string | undefined)
            : undefined;

      return {
        type: `${PROBLEM_TYPE_PREFIX}/${slugForStatus(status)}`,
        title: exception.message || slugForStatus(status),
        status,
        ...(detail && detail !== exception.message ? { detail } : {}),
        instance,
        requestId,
      };
    }

    // Нарушение UNIQUE доходит сюда только если сервис не проверил его сам;
    // наружу уходит 409 без имён колонок.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          type: `${PROBLEM_TYPE_PREFIX}/conflict`,
          title: 'Запись с такими данными уже существует',
          status: HttpStatus.CONFLICT,
          instance,
          requestId,
        };
      }
      if (exception.code === 'P2025') {
        return {
          type: `${PROBLEM_TYPE_PREFIX}/not-found`,
          title: 'Запись не найдена',
          status: HttpStatus.NOT_FOUND,
          instance,
          requestId,
        };
      }
    }

    return {
      type: `${PROBLEM_TYPE_PREFIX}/internal-error`,
      title: 'Внутренняя ошибка сервера',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      instance,
      requestId,
    };
  }
}

function slugForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'bad-request';
    case HttpStatus.UNAUTHORIZED:
      return 'unauthenticated';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'not-found';
    case HttpStatus.CONFLICT:
      return 'conflict';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'validation-failed';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'too-many-requests';
    default:
      return 'error';
  }
}

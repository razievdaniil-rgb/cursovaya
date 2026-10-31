import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { Problems } from '../common/problem';
import type { AuthenticatedRequest, RequestUser } from './jwt-auth.guard';

/** Пользователь, установленный JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) throw Problems.unauthenticated();

    return request.user;
  },
);

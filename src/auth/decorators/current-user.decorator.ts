import { User } from '@prisma/client';

import { ExecutionContext, createParamDecorator } from '@nestjs/common';

interface RequestWithUser extends Request {
  user: Pick<User, 'id' | 'username' | 'email' | 'isAnonymous'>;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);

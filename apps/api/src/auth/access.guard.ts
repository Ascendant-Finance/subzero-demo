import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { TokenService } from './token.service';

/** Global guard. Every route needs a valid access token unless marked @Public. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw AppError.unauthenticated();

    const payload = this.tokens.verifyAccessToken(header.slice('Bearer '.length));
    request.user = { id: payload.sub, email: payload.email, name: payload.name };
    return true;
  }
}

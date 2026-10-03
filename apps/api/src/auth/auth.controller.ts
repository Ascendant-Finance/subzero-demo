import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loginBodySchema, registerBodySchema } from '@trello-clone/shared';
import type { Request, Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { AppError } from '../common/app-error';
import { Public } from '../common/public.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

export const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(zodBody(registerBodySchema)) body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // On demo.sub-zero.dev an account without a SubZero sandbox would report its
    // crashes nowhere, so the only way in is the demo signup.
    if (this.config.get<string>('DEMO_MODE') === 'true') {
      throw AppError.forbidden('Start your demo at /start');
    }
    const { refreshToken, ...rest } = await this.auth.register(body);
    this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Public()
  @Post('login')
  async login(
    @Body(zodBody(loginBodySchema)) body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.auth.login(body);
    this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, accessToken } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  private setRefreshCookie(res: Response, token: string) {
    setRefreshCookie(res, token, this.config, this.tokens);
  }
}

/** Shared with the demo signup, which starts a session the same way login does. */
export function setRefreshCookie(
  res: Response,
  token: string,
  config: ConfigService,
  tokens: TokenService,
) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.get<string>('NODE_ENV') === 'production',
    domain: config.get<string>('COOKIE_DOMAIN', 'localhost'),
    path: '/api/auth',
    maxAge: tokens.refreshTtlMs(),
  });
}

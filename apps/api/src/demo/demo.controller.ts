import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { setRefreshCookie } from '../auth/auth.controller';
import { TokenService } from '../auth/token.service';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { zodBody } from '../common/zod-validation.pipe';
import { DemoService, demoSignupSchema, type DemoSignup } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(201)
  async signup(
    @Body(zodBody(demoSignupSchema)) body: DemoSignup,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.demo.signup(body, req.ip ?? 'unknown');
    setRefreshCookie(res, refreshToken, this.config, this.tokens);
    return rest;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.demo.details(user.id);
  }
}

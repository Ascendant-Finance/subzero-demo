import { Injectable } from '@nestjs/common';
import type { LoginBody, RegisterBody } from '@trello-clone/shared';
import * as bcrypt from 'bcryptjs';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(body: RegisterBody) {
    const email = body.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw AppError.conflict('That email is already registered');

    const user = await this.prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      select: PUBLIC_USER_SELECT,
    });

    return this.issueSession(user);
  }

  async login(body: LoginBody) {
    const email = body.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw AppError.unauthenticated('Incorrect email or password');
    }
    return this.issueSession({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw AppError.unauthenticated('Missing refresh token');
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw AppError.unauthenticated('Unknown user');
    return {
      accessToken: this.tokens.signAccessToken({
        sub: user.id,
        email: user.email,
        name: user.name,
      }),
      refreshToken: rotated.token,
    };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.tokens.revokeRefreshToken(refreshToken);
    return { ok: true as const };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw AppError.unauthenticated('Unknown user');
    return { user };
  }

  async issueSession(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }) {
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });
    const refresh = await this.tokens.issueRefreshToken(user.id);
    return { user, accessToken, refreshToken: refresh.token };
  }
}

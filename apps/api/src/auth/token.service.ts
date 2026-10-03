import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
}

/**
 * Access tokens are short lived JWTs. Refresh tokens are opaque random strings
 * stored only as a sha256 digest, rotated on every use.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') throw AppError.tokenExpired();
      throw AppError.unauthenticated();
    }
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshTtlMs(): number {
    const raw = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const match = raw.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    return value * unit;
  }

  async issueRefreshToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashRefreshToken(token), expiresAt },
    });
    return { token, expiresAt };
  }

  /** Consumes a refresh token and issues its replacement in one transaction. */
  async rotateRefreshToken(token: string): Promise<{ userId: string; token: string }> {
    const tokenHash = this.hashRefreshToken(token);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      throw AppError.unauthenticated('Invalid refresh token');
    }
    const next = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: this.hashRefreshToken(next),
          expiresAt,
        },
      }),
    ]);
    return { userId: existing.userId, token: next };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

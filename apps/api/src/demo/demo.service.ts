import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import { AuthService } from '../auth/auth.service';
import { AppError } from '../common/app-error';
import { sendToKoryo } from '../common/koryo';
import { SubZeroNotifier } from '../common/sub-zero.notifier';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { seedDemoWorkspace } from './demo-seed';
import { warmUp } from './demo-warmup';
import { SubZeroProvisioner } from './subzero-provisioner';

export const demoSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  name: z.string().trim().min(1).max(80),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  /** Honeypot: hidden from people, filled in by form-spamming scripts. */
  website: z.string().max(0).optional().or(z.literal('')),
});
export type DemoSignup = z.infer<typeof demoSignupSchema>;

const ROUTE_CACHE_MS = 60_000;

/**
 * demo.sub-zero.dev's signup: one form gives a prospect a seeded workspace here,
 * a SubZero sandbox there, and a queue that already has work in it.
 */
@Injectable()
export class DemoService implements OnModuleInit {
  private readonly logger = new Logger(DemoService.name);
  private readonly routes = new Map<string, { route: { projectKey: string; ingestKey: string } | null; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly provisioner: SubZeroProvisioner,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Each prospect's crashes go to their own SubZero project.
    SubZeroNotifier.router = (userId) => this.routeFor(userId);
  }

  async signup(body: DemoSignup, ip: string) {
    if (body.website) throw AppError.validation('Validation failed');
    await this.rateLimit(ip);

    if (await this.prisma.user.findUnique({ where: { email: body.email } })) {
      throw AppError.conflict('That email already has a demo. Sign in instead.');
    }

    const company = body.company || undefined;
    const sandbox = await this.provisioner.provision({ email: body.email, name: body.name, company });

    const password = randomBytes(9).toString('base64url');
    const { user, seed } = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(password, 10) },
          select: { id: true, email: true, name: true, avatarUrl: true },
        });
        await tx.demoTenant.create({
          data: {
            userId: user.id,
            company,
            subzeroProjectKey: sandbox.projectKey,
            subzeroIngestKey: sandbox.ingestKey,
            expiresAt: new Date(sandbox.expiresAt),
          },
        });
        const seed = await seedDemoWorkspace(tx, user);
        return { user, seed };
      },
      { timeout: 60_000 },
    );

    const session = await this.auth.issueSession(user);

    // After the response, so the welcome page is on screen as the tickets land.
    const apiBase = `http://127.0.0.1:${this.config.get<string>('API_PORT', '4000')}/api`;
    setTimeout(() => void warmUp(apiBase, session.accessToken, seed), 2_000).unref();
    void this.announceLead(body, sandbox.projectKey);
    // `website` is the honeypot: it never goes to Koryo, not even as `domain`.
    void sendToKoryo(
      {
        email: body.email,
        name: body.name,
        company,
        context: { page: '/start', product: 'subzero-demo', project: sandbox.projectKey },
        ip: ip === 'unknown' ? undefined : ip,
      },
      { key: this.config.get<string>('KORYO_CAPTURE_KEY'), url: this.config.get<string>('KORYO_CAPTURE_URL') },
    );

    this.logger.log(`Demo ready for ${body.email} (${sandbox.projectKey})`);
    return {
      ...session,
      demo: {
        trelloPassword: password,
        subzero: sandbox.login,
        ...this.publicDetails(sandbox.projectKey, sandbox.expiresAt),
      },
    };
  }

  /** What the welcome page shows on a return visit. Never any credential. */
  async details(userId: string) {
    const tenant = await this.prisma.demoTenant.findUnique({ where: { userId } });
    if (!tenant) throw AppError.notFound('No demo for this account');
    return { demo: this.publicDetails(tenant.subzeroProjectKey, tenant.expiresAt.toISOString()) };
  }

  private publicDetails(projectKey: string, expiresAt: string) {
    return {
      projectKey,
      expiresAt,
      dashboardUrl: this.config.get<string>('SUBZERO_DASHBOARD_URL', 'https://dashboard.sub-zero.dev'),
      apiUrl: this.config.get<string>('SUBZERO_PUBLIC_API_URL', 'https://api.sub-zero.dev'),
      repoUrl: this.config.get<string>('DEMO_REPO_URL', 'https://github.com/Ascendant-Finance/subzero-demo'),
    };
  }

  private async routeFor(userId: string | undefined) {
    if (!userId) return null;
    const cached = this.routes.get(userId);
    if (cached && Date.now() - cached.at < ROUTE_CACHE_MS) return cached.route;
    const tenant = await this.prisma.demoTenant.findUnique({ where: { userId } });
    const route = tenant ? { projectKey: tenant.subzeroProjectKey, ingestKey: tenant.subzeroIngestKey } : null;
    this.routes.set(userId, { route, at: Date.now() });
    return route;
  }

  /**
   * Each signup creates real accounts in two systems, so it is metered: a few
   * per address per hour, and a ceiling per day across everyone.
   */
  private async rateLimit(ip: string) {
    const perIp = Number(this.config.get('DEMO_SIGNUPS_PER_IP_PER_HOUR', 5));
    const perDay = Number(this.config.get('DEMO_SIGNUPS_PER_DAY', 200));
    const day = new Date().toISOString().slice(0, 10);
    const [ipCount, dayCount] = await Promise.all([
      this.bump(`demo:signup:ip:${ip}`, 3600),
      this.bump(`demo:signup:day:${day}`, 86_400),
    ]);
    if (ipCount > perIp || dayCount > perDay) {
      throw new AppError('RATE_LIMITED', 'Too many demo signups right now. Try again later.');
    }
  }

  private async bump(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, ttlSeconds);
    return count;
  }

  private async announceLead(body: DemoSignup, projectKey: string) {
    const url = this.config.get<string>('DEMO_LEAD_WEBHOOK_URL');
    if (!url) return;
    const text = `New demo signup: ${body.name} <${body.email}>${body.company ? ` from ${body.company}` : ''} — SubZero project ${projectKey}`;
    try {
      // `text` for Slack, `content` for Discord; each ignores the other.
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: unknown) {
      this.logger.warn(`Lead webhook failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

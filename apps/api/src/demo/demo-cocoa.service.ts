import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
@Injectable()
export class DemoCocoaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async request(userId: string, action: 'status' | 'start' | 'preview') {
    const tenant = await this.prisma.demoTenant.findUnique({ where: { userId } });
    if (!tenant || tenant.expiresAt <= new Date())
      throw AppError.forbidden('Your demo has expired.');
    const provision = this.config.get<string>(
      'SUBZERO_DEMO_PROVISION_URL',
      'https://api.sub-zero.dev/demo/provision',
    );
    const base = new URL(provision);
    if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1')
      throw AppError.internal('Invalid demo service configuration');
    base.pathname =
      base.pathname.replace(/\/provision\/?$/, '') +
      '/cocoa/' +
      encodeURIComponent(tenant.subzeroProjectKey) +
      (action === 'status' ? '' : '/' + action);
    base.search = '';
    base.hash = '';
    const secret = this.config.get<string>('DEMO_PROVISION_SECRET', '');
    if (secret.length < 32) throw AppError.internal('Cocoa demos are not configured yet.');
    let response: Response;
    try {
      response = await fetch(base, {
        method: action === 'status' ? 'GET' : 'POST',
        headers: { 'X-Demo-Provision-Secret': secret },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw AppError.conflict('Cocoa is temporarily unavailable. Please try again.');
    }
    if (!response.ok) {
      if (response.status === 404) throw AppError.conflict('Cocoa demos are not available yet.');
      const data = (await response.json().catch(() => ({}))) as { message?: unknown };
      throw AppError.conflict(
        typeof data.message === 'string' ? data.message : 'Cocoa could not complete that request.',
      );
    }
    return response.json() as Promise<unknown>;
  }
}

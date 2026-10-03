import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../common/app-error';

export interface ProvisionedSandbox {
  projectKey: string;
  projectName: string;
  ingestKey: string;
  login: { email: string; password: string };
  dashboardUrl: string;
  apiUrl: string;
  expiresAt: string;
}

/** Asks SubZero for a project, a scoped login and an ingest key. */
@Injectable()
export class SubZeroProvisioner {
  private readonly logger = new Logger(SubZeroProvisioner.name);

  constructor(private readonly config: ConfigService) {}

  async provision(prospect: { email: string; name: string; company?: string }): Promise<ProvisionedSandbox> {
    const url = this.config.get<string>('SUBZERO_DEMO_PROVISION_URL', 'https://api.sub-zero.dev/demo/provision');
    const secret = this.config.get<string>('DEMO_PROVISION_SECRET', '');
    if (!secret) throw AppError.internal('Demo provisioning is not configured');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Provision-Secret': secret },
        body: JSON.stringify(prospect),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err: unknown) {
      this.logger.error(`SubZero unreachable: ${err instanceof Error ? err.message : String(err)}`);
      throw AppError.internal('SubZero is unreachable right now. Try again in a minute.');
    }

    if (response.status === 409) {
      throw AppError.conflict(
        'That email already has a SubZero account. Sign in to SubZero directly, or use another email for the demo.',
      );
    }
    if (!response.ok) {
      this.logger.error(`SubZero refused provisioning (${response.status}): ${await response.text()}`);
      throw AppError.internal('Could not set up your SubZero sandbox. Try again in a minute.');
    }
    return (await response.json()) as ProvisionedSandbox;
  }
}

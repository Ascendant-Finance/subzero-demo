import { Logger } from '@nestjs/common';

const DEFAULT_URL = 'https://api.koryo.app/capture';
const TIMEOUT_MS = 8_000;

const logger = new Logger('Koryo');

/** One signup, as Koryo's inbound capture endpoint takes it. */
export interface KoryoCapture {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  phone?: string;
  company?: string;
  domain?: string;
  /** ISO-3166 alpha-2, e.g. `US`. */
  country?: string;
  temperature?: 'hot' | 'medium' | 'cold';
  /** Only when the person ticked an unticked-by-default marketing checkbox. A demo signup is not consent. */
  consent?: { marketing: boolean; text?: string };
  context?: Record<string, string | number | boolean>;
  ip?: string;
}

export interface KoryoConfig {
  /** `kor_cap_…`. No key, no call. */
  key?: string;
  url?: string;
}

/**
 * Hands a signup to Koryo, Ascendant.Finance's CRM, as a warm lead for sales.
 *
 * Never throws and never takes longer than the timeout: Koryo being down must
 * not cost anyone their signup. Call it only after the signup has succeeded,
 * and never pass it a honeypot field.
 */
export async function sendToKoryo(input: KoryoCapture, { key, url }: KoryoConfig): Promise<void> {
  if (!key) return;
  try {
    const res = await fetch(url || DEFAULT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(`Capture failed: ${res.status} ${await res.text().catch(() => '')}`);
      return;
    }
    const lead = (await res.json().catch(() => null)) as { leadId?: string; outcome?: string } | null;
    logger.debug(`Capture ${lead?.outcome ?? 'ok'}: ${lead?.leadId ?? '?'}`);
  } catch (err: unknown) {
    logger.warn(`Capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

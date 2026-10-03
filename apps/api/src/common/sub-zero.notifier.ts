import { Logger } from '@nestjs/common';

const SUBZERO_URL = process.env.SUBZERO_URL ?? 'https://api.sub-zero.dev/incidents/external';
// No default project: this code is public, and a clone running on someone's
// laptop must not report into a queue they were never given.
const PROJECT_KEY = process.env.SUBZERO_PROJECT_KEY ?? '';
const INGEST_KEY = process.env.SUBZERO_INGEST_KEY ?? '';
const SERVICE = 'STACKS-DEMO-API';

/**
 * How long one subject stays quiet after it is reported.
 *
 * A broken endpoint is rediscovered by every request that touches it. One
 * incident per window is the signal; fifty is noise that gets muted by whoever
 * is on call, which is worse than silence.
 */
const REPEAT_AFTER_MS = 10 * 60 * 1000;

/**
 * Files a SubZero incident when the API fails in a way nobody asked it to.
 *
 * Only unhandled failures — a 500 — are reported. A 404, a rejected login or a
 * validation error is the API doing its job, and a queue full of those teaches
 * everyone to ignore the queue.
 *
 * Every failure here is swallowed: an error reporter that throws would take
 * down the request it was reporting on.
 */
export interface SubZeroRoute {
  projectKey: string;
  ingestKey: string;
}

export class SubZeroNotifier {
  private static readonly logger = new Logger('SubZeroNotifier');
  private static readonly mutedUntil = new Map<string, number>();

  /**
   * Picks the project a user's failures belong to. On demo.sub-zero.dev each
   * prospect has their own SubZero project, so the destination depends on who
   * hit the fault; with no router, or no route for the user, the environment's
   * project is used.
   */
  static router?: (userId: string | undefined) => Promise<SubZeroRoute | null>;

  static report(params: {
    subject: string;
    method: string;
    path: string;
    error: unknown;
    userId?: string;
  }): void {
    void this.route(params.userId).then((route) => {
      if (route) this.send(params, route);
    });
  }

  private static async route(userId: string | undefined): Promise<SubZeroRoute | null> {
    try {
      const routed = this.router ? await this.router(userId) : null;
      if (routed) return routed;
    } catch (err: unknown) {
      this.logger.warn(`Could not route a SubZero report: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!PROJECT_KEY || !INGEST_KEY) return null;
    return { projectKey: PROJECT_KEY, ingestKey: INGEST_KEY };
  }

  private static send(
    params: { subject: string; method: string; path: string; error: unknown; userId?: string },
    route: SubZeroRoute,
  ): void {
    const { subject, method, path, error, userId } = params;
    // Muted per project: one prospect hitting a fault must not hide it from the next.
    const muteKey = `${route.projectKey}:${subject}`;

    const mutedUntil = this.mutedUntil.get(muteKey);
    if (mutedUntil && Date.now() < mutedUntil) return;
    this.mutedUntil.set(muteKey, Date.now() + REPEAT_AFTER_MS);

    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const description = [
      `${method} ${path} failed with an unhandled error.`,
      userId ? `User: ${userId}` : 'User: unauthenticated',
      '',
      stack,
    ].join('\n');

    void fetch(SUBZERO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(route.ingestKey ? { Authorization: `Bearer ${route.ingestKey}` } : {}),
      },
      body: JSON.stringify({
        projectKey: route.projectKey,
        subject: `[AUTOMATION] : ${subject}`,
        service: SERVICE,
        description,
        priority: 'P2',
      }),
    })
      .then((res) => {
        if (res.ok) {
          this.logger.log(`SubZero incident raised: ${subject}`);
          return;
        }
        // A refused report is worth retrying on the next failure rather than
        // sitting on a mute for something SubZero never received.
        this.mutedUntil.delete(muteKey);
        this.logger.warn(`SubZero refused the incident (${res.status}): ${subject}`);
      })
      .catch((err: unknown) => {
        this.mutedUntil.delete(muteKey);
        this.logger.warn(
          `Could not reach SubZero for "${subject}": ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}

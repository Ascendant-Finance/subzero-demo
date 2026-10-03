import { Logger } from '@nestjs/common';
import type { DemoSeed } from './demo-seed';

const logger = new Logger('DemoWarmup');

/**
 * Uses the new prospect's workspace once, the way a team would on day one, so
 * their SubZero queue is not empty when they first open it.
 *
 * Every call is a real request through the real API as the prospect. Nothing
 * here knows where the faults are or reports anything itself: the incidents
 * that appear are filed by the API's own error reporting, with real stacks.
 */
export async function warmUp(apiBase: string, accessToken: string, seed: DemoSeed): Promise<void> {
  const call = async (method: string, path: string, body?: unknown) => {
    try {
      const res = await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
      logger.log(`${method} ${path} -> ${res.status}`);
    } catch (err: unknown) {
      logger.warn(`${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await call('GET', `/boards/${seed.roadmapBoardId}`);
  await call('PATCH', `/cards/${seed.describedCardId}`, { description: null });
  await call('POST', `/checklists/${seed.emptyChecklistId}/items`, { text: 'Write the announcement' });
  await call('POST', `/cards/${seed.movableCardId}/move`, {
    targetListId: seed.doneListId,
    beforeCardId: seed.otherTodoCardId,
    afterCardId: null,
  });
  await call('GET', `/boards/${seed.roadmapBoardId}/search?due=week`);
  await call('GET', `/boards/${seed.backlogBoardId}`);
}

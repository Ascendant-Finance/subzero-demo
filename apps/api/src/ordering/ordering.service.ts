import { Injectable } from '@nestjs/common';
import {
  needsRebalance,
  positionAtEnd,
  positionBetween,
  seedPositions,
} from '@trello-clone/shared';
import type { Tx } from '../common/prisma-tx';

interface Sibling {
  id: string;
  position: string;
}

/**
 * The server side ordering engine (spec section 5).
 *
 * The client only ever sends neighbour ids. Every method here expects to run
 * inside a transaction that already holds the board lock taken by
 * `lockBoardOrdering`, so concurrent moves on one board serialize.
 */
@Injectable()
export class OrderingService {
  /**
   * Serializes all ordering work for a board. Row locks alone can deadlock when
   * two cross list moves grab their sibling sets in opposite orders, so every
   * move first takes one transaction scoped advisory lock keyed by the board.
   */
  async lockBoardOrdering(tx: Tx, boardId: string): Promise<void> {
    // pg_advisory_xact_lock returns void, so it runs through $executeRaw.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${boardId}))`;
  }

  /** Locks and returns the cards of a list in position order. */
  async lockCardsInList(tx: Tx, listId: string): Promise<Sibling[]> {
    return tx.$queryRaw<Sibling[]>`
      SELECT id, position FROM "Card"
      WHERE "listId" = ${listId} AND archived = false
      ORDER BY position ASC
      FOR UPDATE`;
  }

  /** Locks and returns the lists of a board in position order. */
  async lockListsInBoard(tx: Tx, boardId: string): Promise<Sibling[]> {
    return tx.$queryRaw<Sibling[]>`
      SELECT id, position FROM "List"
      WHERE "boardId" = ${boardId} AND archived = false
      ORDER BY position ASC
      FOR UPDATE`;
  }

  /**
   * Resolves the two neighbour ids against the live ordered siblings and
   * returns the authoritative key. Neighbour positions come from the database,
   * never from the client. A neighbour that has since moved away is treated as
   * absent and the surviving neighbour still anchors the drop.
   */
  computePosition(
    siblings: Sibling[],
    beforeId: string | null,
    afterId: string | null,
    movedId?: string,
  ): string {
    const scope = movedId ? siblings.filter((s) => s.id !== movedId) : siblings;
    const beforeIndex = beforeId ? scope.findIndex((s) => s.id === beforeId) : -1;
    const afterIndex = afterId ? scope.findIndex((s) => s.id === afterId) : -1;

    if (beforeIndex >= 0 && afterIndex >= 0 && afterIndex === beforeIndex + 1) {
      return positionBetween(scope[beforeIndex].position, scope[afterIndex].position);
    }
    if (beforeIndex >= 0) {
      const next = scope[beforeIndex + 1];
      return positionBetween(scope[beforeIndex].position, next ? next.position : null);
    }
    if (afterIndex >= 0) {
      const previous = scope[afterIndex - 1];
      return positionBetween(previous ? previous.position : null, scope[afterIndex].position);
    }
    // Both neighbours are absent: an empty scope, or a fully stale request.
    // Appending to the end is the stable interpretation.
    return positionAtEnd(scope.length ? scope[scope.length].position : null);
  }

  /** Key for a brand new item appended to the end of a scope. */
  appendPosition(siblings: Sibling[]): string {
    return positionAtEnd(siblings.length ? siblings[siblings.length - 1].position : null);
  }

  needsRebalance(position: string): boolean {
    return needsRebalance(position);
  }

  /**
   * Rewrites every sibling in a scope with evenly spaced keys. Runs in two
   * passes because `@@unique([listId, position])` is a plain unique index and
   * cannot be deferred, so the intermediate state must not collide.
   */
  async rebalanceCards(tx: Tx, listId: string): Promise<string[]> {
    const cards = await tx.$queryRaw<Sibling[]>`
      SELECT id, position FROM "Card"
      WHERE "listId" = ${listId} AND archived = false
      ORDER BY position ASC
      FOR UPDATE`;
    const orderedIds = cards.map((card) => card.id);
    if (!orderedIds.length) return orderedIds;

    const fresh = seedPositions(orderedIds.length);
    for (const card of cards) {
      await tx.card.update({ where: { id: card.id }, data: { position: temporaryKey(card.id) } });
    }
    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx.card.update({ where: { id: orderedIds[i] }, data: { position: fresh[i] } });
    }
    return orderedIds;
  }

  async rebalanceLists(tx: Tx, boardId: string): Promise<string[]> {
    const lists = await tx.$queryRaw<Sibling[]>`
      SELECT id, position FROM "List"
      WHERE "boardId" = ${boardId} AND archived = false
      ORDER BY position ASC
      FOR UPDATE`;
    const orderedIds = lists.map((list) => list.id);
    if (!orderedIds.length) return orderedIds;

    const fresh = seedPositions(orderedIds.length);
    for (const list of lists) {
      await tx.list.update({ where: { id: list.id }, data: { position: temporaryKey(list.id) } });
    }
    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx.list.update({ where: { id: orderedIds[i] }, data: { position: fresh[i] } });
    }
    return orderedIds;
  }
}

/**
 * A staging key that cannot collide with a real one. Fractional keys use a
 * base62 alphabet, so a tilde prefix sorts outside their range, and the row id
 * keeps every staged key distinct.
 */
function temporaryKey(rowId: string): string {
  return `~${rowId}`;
}

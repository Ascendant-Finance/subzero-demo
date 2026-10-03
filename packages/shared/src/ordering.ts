import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Fractional index helpers. The server is the only caller that computes keys.
 * See spec section 5.
 */

/** Longest key we tolerate before rebalancing the whole ordering scope. */
export const MAX_POSITION_LENGTH = 50;

/** Key strictly between two neighbours. Either side may be null at an edge. */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before ?? null, after ?? null);
}

/** Key appended after the current last item, or the first key for an empty scope. */
export function positionAtEnd(last: string | null): string {
  return generateKeyBetween(last ?? null, null);
}

/** N evenly spaced keys, used for seeding and for rebalancing a scope. */
export function seedPositions(count: number): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(null, null, count);
}

/** N evenly spaced keys between two existing neighbours. */
export function positionsBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(before ?? null, after ?? null, count);
}

/** True when a freshly computed key is long enough to warrant a rebalance. */
export function needsRebalance(position: string): boolean {
  return position.length > MAX_POSITION_LENGTH;
}

/** Lexicographic comparator for position strings. */
export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

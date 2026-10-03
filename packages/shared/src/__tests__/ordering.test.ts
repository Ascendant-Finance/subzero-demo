import { describe, expect, it } from 'vitest';
import {
  comparePositions,
  needsRebalance,
  positionAtEnd,
  positionBetween,
  positionsBetween,
  seedPositions,
} from '../ordering.js';

describe('ordering helpers', () => {
  it('seeds the first key in an empty scope', () => {
    const first = positionBetween(null, null);
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
  });

  it('appends after the last key', () => {
    let last = positionAtEnd(null);
    const keys = [last];
    for (let i = 0; i < 10; i += 1) {
      last = positionAtEnd(last);
      keys.push(last);
    }
    expect([...keys].sort()).toEqual(keys);
  });

  it('inserts strictly between two neighbours', () => {
    const a = positionBetween(null, null);
    const b = positionAtEnd(a);
    const mid = positionBetween(a, b);
    expect(comparePositions(a, mid)).toBe(-1);
    expect(comparePositions(mid, b)).toBe(-1);
  });

  it('keeps a 100 item seed correctly ordered and unique', () => {
    const keys = seedPositions(100);
    expect(keys).toHaveLength(100);
    expect(new Set(keys).size).toBe(100);
    expect([...keys].sort()).toEqual(keys);
  });

  it('generates evenly spaced keys between neighbours', () => {
    const a = positionBetween(null, null);
    const b = positionAtEnd(a);
    const mids = positionsBetween(a, b, 5);
    const all = [a, ...mids, b];
    expect([...all].sort()).toEqual(all);
  });

  it('flags a rebalance only past the 50 character threshold', () => {
    expect(needsRebalance('a'.repeat(50))).toBe(false);
    expect(needsRebalance('a'.repeat(51))).toBe(true);
  });

  it('stays ordered across 60 sequential inserts into one gap', () => {
    let low = positionBetween(null, null);
    const high = positionAtEnd(low);
    const inserted: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const key = positionBetween(low, high);
      inserted.push(key);
      low = key;
    }
    expect([...inserted].sort()).toEqual(inserted);
    expect(new Set(inserted).size).toBe(60);
    inserted.forEach((key) => {
      expect(comparePositions(key, high)).toBe(-1);
    });
  });

  it('crosses the rebalance threshold once a gap is deep enough', () => {
    // 60 inserts alone only reach about 14 characters, so keep splitting the
    // same gap until the key passes the locked 50 character threshold.
    let low = positionBetween(null, null);
    const high = positionAtEnd(low);
    let key = low;
    let guard = 0;
    while (!needsRebalance(key) && guard < 1000) {
      key = positionBetween(low, high);
      low = key;
      guard += 1;
    }
    expect(needsRebalance(key)).toBe(true);
    expect(key.length).toBeGreaterThan(50);
  });
});

import { describe, expect, it } from 'vitest';
import { activeMentionQuery, parseMentions } from '../mentions.js';

const people = [
  { id: 'u1', name: 'Ada Lovelace' },
  { id: 'u2', name: 'Ada' },
  { id: 'u3', name: 'Grace Hopper' },
];

describe('parseMentions', () => {
  it('matches the longest candidate name first', () => {
    expect(parseMentions('ping @Ada Lovelace please', people)).toEqual(['u1']);
  });

  it('matches a short name on its own', () => {
    expect(parseMentions('hey @Ada what do you think', people)).toEqual(['u2']);
  });

  it('finds several mentions', () => {
    const hits = parseMentions('@Grace Hopper and @Ada', people).sort();
    expect(hits).toEqual(['u2', 'u3']);
  });

  it('ignores emails and unknown names', () => {
    expect(parseMentions('mail me at me@Ada.com or @Nobody', people)).toEqual([]);
  });
});

describe('activeMentionQuery', () => {
  it('returns the partial query at the caret', () => {
    const text = 'hello @Gra';
    expect(activeMentionQuery(text, text.length)).toBe('Gra');
  });

  it('returns null with no active mention', () => {
    const text = 'hello there';
    expect(activeMentionQuery(text, text.length)).toBeNull();
  });
});

/**
 * Mention parsing shared by the comment service and the web mention autocomplete.
 * A mention is `@` followed by a display name, matched against board member
 * names longest first. A matched span is blanked out so that a shorter name that
 * sits inside a longer one ("Ada" inside "@Ada Lovelace") does not also match.
 */
export function parseMentions(text: string, candidates: { id: string; name: string }[]): string[] {
  const hits = new Set<string>();
  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);
  let working = text;
  for (const candidate of sorted) {
    const escaped = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^\\w@])@${escaped}(?![\\w])`, 'gi');
    let matched = false;
    working = working.replace(pattern, (whole, lead: string) => {
      matched = true;
      return lead + ' '.repeat(whole.length - lead.length);
    });
    if (matched) hits.add(candidate.id);
  }
  return [...hits];
}

/** Returns the in progress `@query` at the caret, or null. Drives autocomplete. */
export function activeMentionQuery(text: string, caret: number): string | null {
  const upToCaret = text.slice(0, caret);
  const match = upToCaret.match(/(?:^|[^\w@])@([\w ]{0,40})$/);
  return match ? match[1] : null;
}

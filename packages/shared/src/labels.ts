/** Locked default label palette, seeded on every new board. Spec section 8.1. */
export const DEFAULT_LABELS = [
  { name: '', color: '#61bd4f' },
  { name: '', color: '#f2d600' },
  { name: '', color: '#ff9f1a' },
  { name: '', color: '#eb5a46' },
  { name: '', color: '#c377e0' },
  { name: '', color: '#0079bf' },
] as const;

export const LABEL_COLORS = DEFAULT_LABELS.map((l) => l.color);

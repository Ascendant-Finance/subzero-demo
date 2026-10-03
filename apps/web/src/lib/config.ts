export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
export const API_BASE = `${API_URL}/api`;

/** demo.sub-zero.dev: accounts come from the demo signup, not /register. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

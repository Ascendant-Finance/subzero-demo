'use client';

import type { DemoCredentials } from './api';

/**
 * The one-time credentials from signup, held for this tab only so the welcome
 * page can show them after the redirect. The server never returns them again.
 */
const KEY = 'subzero-demo-credentials';

export function saveDemoCredentials(credentials: DemoCredentials) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(credentials));
  } catch {
    // Private windows can refuse storage; the welcome page copes without it.
  }
}

export function loadDemoCredentials(): DemoCredentials | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoCredentials) : null;
  } catch {
    return null;
  }
}

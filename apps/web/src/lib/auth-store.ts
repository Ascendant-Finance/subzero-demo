'use client';

import type { User } from '@trello-clone/shared';

/**
 * The access token lives in memory only. The refresh token is an httpOnly
 * cookie the browser sends to /api/auth/refresh, so a reload restores the
 * session without ever exposing a long lived token to scripts.
 */
let accessToken: string | null = null;
let currentUser: User | null = null;
const listeners = new Set<() => void>();

export function setSession(token: string | null, user: User | null) {
  accessToken = token;
  currentUser = user;
  listeners.forEach((listener) => listener());
}

export function getAccessToken() {
  return accessToken;
}

export function getCurrentUser() {
  return currentUser;
}

export function subscribeToSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

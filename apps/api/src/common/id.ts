import { randomBytes } from 'node:crypto';

/**
 * Collision resistant id in the same shape Prisma's cuid default produces.
 * Used when the API needs an id before the row exists, such as a presigned
 * upload key.
 */
export function createId(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString('hex')}`;
}

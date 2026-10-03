import { Injectable, Logger } from '@nestjs/common';
import { ROOMS, WS_EVENTS, type PresenceViewer } from '@trello-clone/shared';
import type { Server } from 'socket.io';
import { RedisService } from '../redis/redis.service';

const PRESENCE_TTL_SECONDS = 60;

/**
 * Broadcast facade. Services depend on this rather than on the gateway, which
 * keeps the mutation path free of a circular dependency. The gateway hands its
 * socket.io server over on init.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  constructor(private readonly redis: RedisService) {}

  bind(server: Server) {
    this.server = server;
  }

  toBoard(boardId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(ROOMS.board(boardId)).emit(event, payload);
  }

  toUser(userId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(ROOMS.user(userId)).emit(event, payload);
  }

  /* ------------------------------------------------------------ presence */

  private presenceKey(boardId: string) {
    return `presence:board:${boardId}`;
  }

  async addViewer(boardId: string, socketId: string, viewer: PresenceViewer) {
    await this.redis.client.hset(
      this.presenceKey(boardId),
      socketId,
      JSON.stringify({ ...viewer, at: Date.now() }),
    );
    await this.redis.client.expire(this.presenceKey(boardId), PRESENCE_TTL_SECONDS * 10);
    await this.broadcastPresence(boardId);
  }

  async touchViewer(boardId: string, socketId: string) {
    const raw = await this.redis.client.hget(this.presenceKey(boardId), socketId);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.at = Date.now();
    await this.redis.client.hset(this.presenceKey(boardId), socketId, JSON.stringify(parsed));
  }

  async removeViewer(boardId: string, socketId: string) {
    await this.redis.client.hdel(this.presenceKey(boardId), socketId);
    await this.broadcastPresence(boardId);
  }

  async viewers(boardId: string): Promise<PresenceViewer[]> {
    const entries = await this.redis.client.hgetall(this.presenceKey(boardId));
    const byUser = new Map<string, PresenceViewer>();
    const stale: string[] = [];
    const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000 * 5;

    for (const [socketId, raw] of Object.entries(entries)) {
      try {
        const parsed = JSON.parse(raw) as PresenceViewer & { at: number };
        if (parsed.at < cutoff) {
          stale.push(socketId);
          continue;
        }
        byUser.set(parsed.userId, {
          userId: parsed.userId,
          name: parsed.name,
          avatarUrl: parsed.avatarUrl ?? null,
        });
      } catch {
        stale.push(socketId);
      }
    }

    if (stale.length) {
      await this.redis.client.hdel(this.presenceKey(boardId), ...stale).catch(() => undefined);
    }
    return [...byUser.values()];
  }

  async broadcastPresence(boardId: string) {
    const viewers = await this.viewers(boardId);
    this.toBoard(boardId, WS_EVENTS.PRESENCE_UPDATED, { boardId, viewers });
  }
}

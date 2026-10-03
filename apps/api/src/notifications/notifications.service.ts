import { Injectable } from '@nestjs/common';
import type { NotificationType, Prisma } from '@prisma/client';
import { WS_EVENTS } from '@trello-clone/shared';
import type { Tx } from '../common/prisma-tx';
import { toNotification } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface CreateNotificationInput {
  userId: string;
  actorId: string;
  type: NotificationType;
  boardId?: string | null;
  cardId?: string | null;
  data?: Prisma.JsonObject;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Written inline with the triggering mutation. Never notifies the actor. */
  async record(tx: Tx, inputs: CreateNotificationInput[]) {
    const targets = inputs.filter((input) => input.userId !== input.actorId);
    if (!targets.length) return [];
    const rows = await Promise.all(
      targets.map((input) =>
        tx.notification.create({
          data: {
            userId: input.userId,
            actorId: input.actorId,
            type: input.type,
            boardId: input.boardId ?? null,
            cardId: input.cardId ?? null,
            data: input.data ?? {},
          },
        }),
      ),
    );
    return rows.map(toNotification);
  }

  publish(notifications: ReturnType<typeof toNotification>[]) {
    for (const notification of notifications) {
      this.realtime.toUser(notification.userId, WS_EVENTS.NOTIFICATION_NEW, { notification });
    }
  }

  async list(userId: string, cursor: string | undefined, limit: number) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      notifications: page.map(toNotification),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    return { ok: true as const };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true as const };
  }
}

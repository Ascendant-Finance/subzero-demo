import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { WS_EVENTS, type ActivityType } from '@trello-clone/shared';
import type { Tx } from '../common/prisma-tx';
import { toActivity } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface RecordActivityInput {
  boardId: string;
  cardId?: string | null;
  userId: string;
  type: ActivityType;
  data?: Prisma.JsonObject;
}

/**
 * Activity rows are written inside the same transaction as the mutation that
 * triggered them. There is no worker and no queue (spec section 14).
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Writes the row on the given transaction client and returns the serialized activity. */
  async record(tx: Tx, input: RecordActivityInput) {
    const row = await tx.activity.create({
      data: {
        boardId: input.boardId,
        cardId: input.cardId ?? null,
        userId: input.userId,
        type: input.type,
        data: input.data ?? {},
      },
      include: { user: true },
    });
    return toActivity(row);
  }

  /** Broadcasts an activity after its transaction has committed. */
  publish(boardId: string, activity: ReturnType<typeof toActivity>) {
    this.realtime.toBoard(boardId, WS_EVENTS.ACTIVITY_NEW, { activity });
  }

  async boardFeed(boardId: string, cursor: string | undefined, limit: number) {
    return this.page({ boardId }, cursor, limit);
  }

  async cardFeed(cardId: string, cursor: string | undefined, limit: number) {
    return this.page({ cardId }, cursor, limit);
  }

  private async page(where: Prisma.ActivityWhereInput, cursor: string | undefined, limit: number) {
    const rows = await this.prisma.activity.findMany({
      where,
      include: { user: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      activities: page.map(toActivity),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}

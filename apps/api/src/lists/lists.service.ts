import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  WS_EVENTS,
  type CreateListBody,
  type MoveListBody,
  type UpdateListBody,
} from '@trello-clone/shared';
import { ActivityService } from '../activity/activity.service';
import { toList } from '../common/serialize';
import { OrderingService } from '../ordering/ordering.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * One write path per mutation: the REST controller and the websocket gateway
 * both call these methods (spec rule 8).
 */
@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly ordering: OrderingService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(boardId: string, userId: string, body: CreateListBody) {
    await this.permissions.requireBoardEdit(boardId, userId);

    const { list, activity } = await this.prisma.$transaction(async (tx) => {
      await this.ordering.lockBoardOrdering(tx, boardId);
      const siblings = await this.ordering.lockListsInBoard(tx, boardId);
      const created = await tx.list.create({
        data: { boardId, title: body.title, position: this.ordering.appendPosition(siblings) },
      });
      const record = await this.activity.record(tx, {
        boardId,
        userId,
        type: ACTIVITY_TYPES.LIST_CREATED,
        data: { listId: created.id, listTitle: created.title },
      });
      return { list: created, activity: record };
    });

    const payload = toList(list);
    this.realtime.toBoard(boardId, WS_EVENTS.LIST_CREATED, { list: payload });
    this.activity.publish(boardId, activity);
    return { list: payload };
  }

  async update(listId: string, userId: string, body: UpdateListBody) {
    const { list } = await this.permissions.requireListEdit(listId, userId);

    const { updated, activity } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.list.update({ where: { id: listId }, data: body });
      const record = await this.activity.record(tx, {
        boardId: list.boardId,
        userId,
        type: body.archived ? ACTIVITY_TYPES.LIST_ARCHIVED : ACTIVITY_TYPES.LIST_UPDATED,
        data: { listId, listTitle: row.title },
      });
      return { updated: row, activity: record };
    });

    const payload = toList(updated);
    this.realtime.toBoard(list.boardId, WS_EVENTS.LIST_UPDATED, { list: payload });
    this.activity.publish(list.boardId, activity);
    return { list: payload };
  }

  /** Server authoritative list move. Spec section 5. */
  async move(listId: string, userId: string, body: MoveListBody) {
    const { list } = await this.permissions.requireListEdit(listId, userId);
    const boardId = list.boardId;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.ordering.lockBoardOrdering(tx, boardId);
      const siblings = await this.ordering.lockListsInBoard(tx, boardId);

      const position = this.ordering.computePosition(
        siblings,
        body.beforeListId,
        body.afterListId,
        listId,
      );
      let updated = await tx.list.update({ where: { id: listId }, data: { position } });

      let orderedListIds: string[] | null = null;
      if (this.ordering.needsRebalance(position)) {
        orderedListIds = await this.ordering.rebalanceLists(tx, boardId);
        updated = await tx.list.findUniqueOrThrow({ where: { id: listId } });
      }

      const activity = await this.activity.record(tx, {
        boardId,
        userId,
        type: ACTIVITY_TYPES.LIST_MOVED,
        data: { listId, listTitle: updated.title },
      });
      return { list: updated, orderedListIds, activity };
    });

    const payload = toList(result.list);
    this.realtime.toBoard(boardId, WS_EVENTS.LIST_MOVED, {
      listId: payload.id,
      position: payload.position,
    });
    if (result.orderedListIds) {
      this.realtime.toBoard(boardId, WS_EVENTS.BOARD_LISTS_REORDERED, {
        orderedListIds: result.orderedListIds,
      });
    }
    this.activity.publish(boardId, result.activity);
    return { list: payload };
  }
}

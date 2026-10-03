import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  WS_EVENTS,
  type CreateCardBody,
  type MoveCardBody,
  type UpdateCardBody,
} from '@trello-clone/shared';
import { ActivityService } from '../activity/activity.service';
import { AppError } from '../common/app-error';
import {
  toAttachment,
  toCard,
  toChecklist,
  toComment,
  toLabel,
  toPublicUser,
} from '../common/serialize';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderingService } from '../ordering/ordering.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { aggregatesFor, loadCardAggregates } from './card-aggregates';

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly ordering: OrderingService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(listId: string, userId: string, body: CreateCardBody) {
    const { list } = await this.permissions.requireListEdit(listId, userId);

    const { card, activity } = await this.prisma.$transaction(async (tx) => {
      await this.ordering.lockBoardOrdering(tx, list.boardId);
      const siblings = await this.ordering.lockCardsInList(tx, listId);
      const created = await tx.card.create({
        data: {
          boardId: list.boardId,
          listId,
          title: body.title,
          position: this.ordering.appendPosition(siblings),
          createdById: userId,
        },
      });
      const record = await this.activity.record(tx, {
        boardId: list.boardId,
        cardId: created.id,
        userId,
        type: ACTIVITY_TYPES.CARD_CREATED,
        data: { cardTitle: created.title, listTitle: list.title },
      });
      return { card: created, activity: record };
    });

    const payload = toCard(card, await aggregatesFor(this.prisma, card));
    this.realtime.toBoard(list.boardId, WS_EVENTS.CARD_CREATED, { card: payload });
    this.activity.publish(list.boardId, activity);
    return { card: payload };
  }

  /** Full card payload for the modal (spec 6.3). */
  async detail(cardId: string, userId: string) {
    const { card } = await this.permissions.requireCardView(cardId, userId);

    const [labels, members, checklists, comments, attachments, aggregates] = await Promise.all([
      this.prisma.cardLabel.findMany({ where: { cardId }, include: { label: true } }),
      this.prisma.cardMember.findMany({ where: { cardId }, include: { user: true } }),
      this.prisma.checklist.findMany({
        where: { cardId },
        include: { items: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
      }),
      this.prisma.comment.findMany({
        where: { cardId },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.attachment.findMany({ where: { cardId }, orderBy: { createdAt: 'desc' } }),
      aggregatesFor(this.prisma, card),
    ]);

    return {
      card: toCard(card, aggregates),
      labels: labels.map((row) => toLabel(row.label)),
      members: members.map((row) => toPublicUser(row.user)),
      checklists: checklists.map(toChecklist),
      comments: comments.map(toComment),
      attachments: attachments.map(toAttachment),
    };
  }

  async update(cardId: string, userId: string, body: UpdateCardBody) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);

    const data: Record<string, unknown> = { ...body };
    if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (body.description !== undefined) data.description = body.description!.trim();

    const { updated, activity } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.card.update({ where: { id: cardId }, data });
      const record = await this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: body.archived ? ACTIVITY_TYPES.CARD_ARCHIVED : ACTIVITY_TYPES.CARD_UPDATED,
        data: { cardTitle: row.title, changed: Object.keys(body) },
      });
      return { updated: row, activity: record };
    });

    const payload = toCard(updated, await aggregatesFor(this.prisma, updated));
    this.realtime.toBoard(card.boardId, WS_EVENTS.CARD_UPDATED, { card: payload });
    this.activity.publish(card.boardId, activity);
    return { card: payload };
  }

  /**
   * Server authoritative card move, within a list or across lists.
   * Spec section 5: neighbour ids in, one locked transaction, authoritative key out.
   */
  async move(cardId: string, userId: string, body: MoveCardBody) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);
    const boardId = card.boardId;

    const targetList = await this.prisma.list.findUnique({ where: { id: body.targetListId } });
    if (!targetList || targetList.boardId !== boardId) {
      throw AppError.notFound('Target list not found on this board');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.ordering.lockBoardOrdering(tx, boardId);
      const siblings = await this.ordering.lockCardsInList(tx, body.targetListId);

      const position = this.ordering.computePosition(
        siblings,
        body.beforeCardId,
        body.afterCardId,
        cardId,
      );

      let updated = await tx.card.update({
        where: { id: cardId },
        data: { listId: body.targetListId, position },
      });

      let orderedCardIds: string[] | null = null;
      if (this.ordering.needsRebalance(position)) {
        orderedCardIds = await this.ordering.rebalanceCards(tx, body.targetListId);
        updated = await tx.card.findUniqueOrThrow({ where: { id: cardId } });
      }

      const activity = await this.activity.record(tx, {
        boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.CARD_MOVED,
        data: {
          cardTitle: updated.title,
          fromListId: card.listId,
          toListId: body.targetListId,
          toListTitle: targetList.title,
        },
      });

      return { card: updated, orderedCardIds, activity };
    });

    const moved = result.card;
    this.realtime.toBoard(boardId, WS_EVENTS.CARD_MOVED, {
      cardId: moved.id,
      listId: moved.listId,
      position: moved.position,
    });
    if (result.orderedCardIds) {
      this.realtime.toBoard(boardId, WS_EVENTS.LIST_REORDERED, {
        listId: body.targetListId,
        orderedCardIds: result.orderedCardIds,
      });
    }
    this.activity.publish(boardId, result.activity);

    return { card: toCard(moved, await aggregatesFor(this.prisma, moved)) };
  }

  /* --------------------------------------------------- labels and members */

  async addLabel(cardId: string, userId: string, labelId: string) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);
    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label || label.boardId !== card.boardId) throw AppError.notFound('Label not found');

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.cardLabel.upsert({
        where: { cardId_labelId: { cardId, labelId } },
        create: { cardId, labelId },
        update: {},
      });
      return this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.CARD_LABEL_ADDED,
        data: { labelId, labelColor: label.color, cardTitle: card.title },
      });
    });

    await this.broadcastLabels(card.boardId, cardId);
    this.activity.publish(card.boardId, activity);
    return { ok: true as const };
  }

  async removeLabel(cardId: string, userId: string, labelId: string) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.cardLabel.deleteMany({ where: { cardId, labelId } });
      return this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.CARD_LABEL_REMOVED,
        data: { labelId, cardTitle: card.title },
      });
    });

    await this.broadcastLabels(card.boardId, cardId);
    this.activity.publish(card.boardId, activity);
    return { ok: true as const };
  }

  async addMember(cardId: string, actorId: string, targetUserId: string) {
    const { card } = await this.permissions.requireCardEdit(cardId, actorId);
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: card.boardId, userId: targetUserId } },
    });
    if (!membership) throw AppError.validation('That user is not a member of this board');

    const { activity, notifications } = await this.prisma.$transaction(async (tx) => {
      await tx.cardMember.upsert({
        where: { cardId_userId: { cardId, userId: targetUserId } },
        create: { cardId, userId: targetUserId },
        update: {},
      });
      const record = await this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId: actorId,
        type: ACTIVITY_TYPES.CARD_MEMBER_ADDED,
        data: { targetUserId, cardTitle: card.title },
      });
      const notes = await this.notifications.record(tx, [
        {
          userId: targetUserId,
          actorId,
          type: 'assigned',
          boardId: card.boardId,
          cardId,
          data: { cardTitle: card.title },
        },
      ]);
      return { activity: record, notifications: notes };
    });

    await this.broadcastMembers(card.boardId, cardId);
    this.activity.publish(card.boardId, activity);
    this.notifications.publish(notifications);
    return { ok: true as const };
  }

  async removeMember(cardId: string, actorId: string, targetUserId: string) {
    const { card } = await this.permissions.requireCardEdit(cardId, actorId);

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.cardMember.deleteMany({ where: { cardId, userId: targetUserId } });
      return this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId: actorId,
        type: ACTIVITY_TYPES.CARD_MEMBER_REMOVED,
        data: { targetUserId, cardTitle: card.title },
      });
    });

    await this.broadcastMembers(card.boardId, cardId);
    this.activity.publish(card.boardId, activity);
    return { ok: true as const };
  }

  /* ------------------------------------------------------------- helpers */

  async broadcastLabels(boardId: string, cardId: string) {
    const rows = await this.prisma.cardLabel.findMany({
      where: { cardId },
      include: { label: true },
    });
    this.realtime.toBoard(boardId, WS_EVENTS.LABEL_CHANGED, {
      cardId,
      labels: rows.map((row) => toLabel(row.label)),
    });
    await this.broadcastCard(boardId, cardId);
  }

  async broadcastMembers(boardId: string, cardId: string) {
    const rows = await this.prisma.cardMember.findMany({
      where: { cardId },
      include: { user: true },
    });
    this.realtime.toBoard(boardId, WS_EVENTS.MEMBER_CHANGED, {
      cardId,
      members: rows.map((row) => toPublicUser(row.user)),
    });
    await this.broadcastCard(boardId, cardId);
  }

  /** Re-broadcasts the card front so badges stay in sync on every client. */
  async broadcastCard(boardId: string, cardId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return;
    const aggregates = await loadCardAggregates(this.prisma, [cardId]);
    this.realtime.toBoard(boardId, WS_EVENTS.CARD_UPDATED, {
      card: toCard(card, aggregates.get(cardId) ?? {}),
    });
  }
}

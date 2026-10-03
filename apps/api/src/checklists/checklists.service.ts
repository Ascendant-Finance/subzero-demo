import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  WS_EVENTS,
  positionAtEnd,
  type CreateChecklistBody,
  type CreateChecklistItemBody,
  type UpdateChecklistItemBody,
} from '@trello-clone/shared';
import { ActivityService } from '../activity/activity.service';
import { CardsService } from '../cards/cards.service';
import { AppError } from '../common/app-error';
import { toChecklist, toChecklistItem } from '../common/serialize';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly cards: CardsService,
  ) {}

  async create(cardId: string, userId: string, body: CreateChecklistBody) {
    const { card } = await this.permissions.requireCardEdit(cardId, userId);

    const { checklist, activity } = await this.prisma.$transaction(async (tx) => {
      const last = await tx.checklist.findFirst({
        where: { cardId },
        orderBy: { position: 'desc' },
      });
      const created = await tx.checklist.create({
        data: { cardId, title: body.title, position: positionAtEnd(last?.position ?? null) },
        include: { items: true },
      });
      const record = await this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.CHECKLIST_CREATED,
        data: { checklistTitle: created.title, cardTitle: card.title },
      });
      return { checklist: created, activity: record };
    });

    await this.broadcast(card.boardId, cardId);
    this.activity.publish(card.boardId, activity);
    return { checklist: toChecklist(checklist) };
  }

  async update(checklistId: string, userId: string, title: string) {
    const { checklist, card } = await this.load(checklistId, userId);
    const updated = await this.prisma.checklist.update({
      where: { id: checklist.id },
      data: { title },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    await this.broadcast(card.boardId, card.id);
    return { checklist: toChecklist(updated) };
  }

  async remove(checklistId: string, userId: string) {
    const { checklist, card } = await this.load(checklistId, userId);

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.checklist.delete({ where: { id: checklist.id } });
      return this.activity.record(tx, {
        boardId: card.boardId,
        cardId: card.id,
        userId,
        type: ACTIVITY_TYPES.CHECKLIST_DELETED,
        data: { checklistTitle: checklist.title },
      });
    });

    await this.broadcast(card.boardId, card.id);
    this.activity.publish(card.boardId, activity);
    return { ok: true as const };
  }

  async createItem(checklistId: string, userId: string, body: CreateChecklistItemBody) {
    const { checklist, card } = await this.load(checklistId, userId);

    const item = await this.prisma.$transaction(async (tx) => {
      const last = await tx.checklistItem.findFirst({
        where: { checklistId: checklist.id },
        orderBy: { position: 'desc' },
      });
      return tx.checklistItem.create({
        data: {
          checklistId: checklist.id,
          text: body.text,
          position: positionAtEnd(last!.position),
        },
      });
    });

    await this.broadcast(card.boardId, card.id);
    return { item: toChecklistItem(item) };
  }

  async updateItem(itemId: string, userId: string, body: UpdateChecklistItemBody) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { checklist: true },
    });
    if (!item) throw AppError.notFound('Checklist item not found');
    const { card } = await this.permissions.requireCardEdit(item.checklist.cardId, userId);

    const data: Record<string, unknown> = { ...body };
    if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;

    const updated = await this.prisma.checklistItem.update({ where: { id: itemId }, data });
    await this.broadcast(card.boardId, card.id);
    return { item: toChecklistItem(updated) };
  }

  async removeItem(itemId: string, userId: string) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { checklist: true },
    });
    if (!item) throw AppError.notFound('Checklist item not found');
    const { card } = await this.permissions.requireCardEdit(item.checklist.cardId, userId);

    await this.prisma.checklistItem.delete({ where: { id: itemId } });
    await this.broadcast(card.boardId, card.id);
    return { ok: true as const };
  }

  private async load(checklistId: string, userId: string) {
    const checklist = await this.prisma.checklist.findUnique({ where: { id: checklistId } });
    if (!checklist) throw AppError.notFound('Checklist not found');
    const { card } = await this.permissions.requireCardEdit(checklist.cardId, userId);
    return { checklist, card };
  }

  /** Checklists always travel as the full set for a card (spec 6.4). */
  private async broadcast(boardId: string, cardId: string) {
    const checklists = await this.prisma.checklist.findMany({
      where: { cardId },
      include: { items: { orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    this.realtime.toBoard(boardId, WS_EVENTS.CHECKLIST_CHANGED, {
      cardId,
      checklists: checklists.map(toChecklist),
    });
    await this.cards.broadcastCard(boardId, cardId);
  }
}

import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  WS_EVENTS,
  parseMentions,
  type CreateCommentBody,
} from '@trello-clone/shared';
import { ActivityService } from '../activity/activity.service';
import { CardsService } from '../cards/cards.service';
import { AppError } from '../common/app-error';
import { toComment } from '../common/serialize';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly cards: CardsService,
  ) {}

  /** Observers may comment (open decision 2, spec default). */
  async create(cardId: string, userId: string, body: CreateCommentBody) {
    const { card } = await this.permissions.requireCardComment(cardId, userId);

    const boardMembers = await this.prisma.boardMember.findMany({
      where: { boardId: card.boardId },
      include: { user: true },
    });
    const mentionedIds = parseMentions(
      body.text,
      boardMembers.map((member) => ({ id: member.userId, name: member.user.name })),
    );

    const { comment, activity, notifications } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { cardId, userId, text: body.text },
        include: { user: true },
      });
      const record = await this.activity.record(tx, {
        boardId: card.boardId,
        cardId,
        userId,
        type: ACTIVITY_TYPES.COMMENT_CREATED,
        data: { cardTitle: card.title, commentId: created.id, text: body.text.slice(0, 200) },
      });
      const notes = await this.notifications.record(
        tx,
        mentionedIds.map((mentionedId) => ({
          userId: mentionedId,
          actorId: userId,
          type: 'mention' as const,
          boardId: card.boardId,
          cardId,
          data: { cardTitle: card.title, commentId: created.id },
        })),
      );
      return { comment: created, activity: record, notifications: notes };
    });

    const payload = toComment(comment);
    this.realtime.toBoard(card.boardId, WS_EVENTS.COMMENT_CREATED, { comment: payload });
    this.activity.publish(card.boardId, activity);
    this.notifications.publish(notifications);
    await this.cards.broadcastCard(card.boardId, cardId);
    return { comment: payload };
  }

  async update(commentId: string, userId: string, text: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw AppError.notFound('Comment not found');
    if (comment.userId !== userId) throw AppError.forbidden('You can only edit your own comment');
    const { card } = await this.permissions.requireCardComment(comment.cardId, userId);

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { text, editedAt: new Date() },
      include: { user: true },
    });
    const payload = toComment(updated);
    this.realtime.toBoard(card.boardId, WS_EVENTS.COMMENT_CREATED, { comment: payload });
    return { comment: payload };
  }

  /** The author deletes their own comment; a board admin can delete any. */
  async remove(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw AppError.notFound('Comment not found');
    const card = await this.prisma.card.findUniqueOrThrow({ where: { id: comment.cardId } });
    const access = await this.permissions.requireBoardView(card.boardId, userId);
    if (comment.userId !== userId && !access.canAdmin) {
      throw AppError.forbidden('You can only delete your own comment');
    }

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.comment.delete({ where: { id: commentId } });
      return this.activity.record(tx, {
        boardId: card.boardId,
        cardId: card.id,
        userId,
        type: ACTIVITY_TYPES.COMMENT_DELETED,
        data: { commentId },
      });
    });

    this.activity.publish(card.boardId, activity);
    await this.cards.broadcastCard(card.boardId, card.id);
    return { ok: true as const };
  }
}

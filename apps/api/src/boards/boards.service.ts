import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_TYPES,
  DEFAULT_LABELS,
  type AddBoardMemberBody,
  type CreateBoardBody,
  type UpdateBoardBody,
} from '@trello-clone/shared';
import { ActivityService } from '../activity/activity.service';
import { loadCardAggregates } from '../cards/card-aggregates';
import { AppError } from '../common/app-error';
import { toBoard, toBoardMember, toCard, toLabel, toList } from '../common/serialize';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Creating a board seeds the six default labels (spec 6.3). */
  async create(workspaceId: string, userId: string, body: CreateBoardBody) {
    await this.permissions.requireWorkspaceMember(workspaceId, userId);

    const { board, activity } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          workspaceId,
          title: body.title,
          // Open decision 1 resolved to the spec default: workspace visibility.
          visibility: body.visibility ?? 'workspace',
          bgType: body.bgType ?? 'color',
          bgValue: body.bgValue ?? '#1d4ed8',
          createdById: userId,
          members: { create: { userId, role: 'admin' } },
          labels: { create: DEFAULT_LABELS.map((l) => ({ name: l.name, color: l.color })) },
        },
      });
      const record = await this.activity.record(tx, {
        boardId: created.id,
        userId,
        type: ACTIVITY_TYPES.BOARD_CREATED,
        data: { boardTitle: created.title },
      });
      return { board: created, activity: record };
    });

    this.activity.publish(board.id, activity);
    return { board: toBoard(board, false) };
  }

  /** The single bootstrap payload for the board view (spec 6.3). */
  async bootstrap(boardId: string, userId: string) {
    const access = await this.permissions.requireBoardView(boardId, userId);

    const [members, lists, cards, labels, star] = await Promise.all([
      this.prisma.boardMember.findMany({
        where: { boardId },
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.list.findMany({
        where: { boardId, archived: false },
        orderBy: { position: 'asc' },
      }),
      this.prisma.card.findMany({
        where: { boardId, archived: false },
        orderBy: { position: 'asc' },
      }),
      this.prisma.label.findMany({ where: { boardId } }),
      this.prisma.boardStar.findUnique({ where: { boardId_userId: { boardId, userId } } }),
    ]);

    const aggregates = await loadCardAggregates(
      this.prisma,
      cards.map((card) => card.id),
    );

    return {
      board: toBoard(access.board, Boolean(star)),
      members: members.map(toBoardMember),
      lists: lists.map(toList),
      cards: cards.map((card) => toCard(card, aggregates.get(card.id) ?? {})),
      labels: labels.map(toLabel),
    };
  }

  async update(boardId: string, userId: string, body: UpdateBoardBody) {
    await this.permissions.requireBoardAdmin(boardId, userId);

    const { board, activity } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({ where: { id: boardId }, data: body });
      const record = await this.activity.record(tx, {
        boardId,
        userId,
        type: ACTIVITY_TYPES.BOARD_UPDATED,
        data: { changed: Object.keys(body) },
      });
      return { board: updated, activity: record };
    });

    this.activity.publish(boardId, activity);
    return { board: toBoard(board) };
  }

  async setClosed(boardId: string, userId: string, closed: boolean) {
    const access = await this.permissions.requireBoardView(boardId, userId);
    if (!access.canAdmin) throw AppError.forbidden('Board admins only');

    const { board, activity } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({ where: { id: boardId }, data: { closed } });
      const record = await this.activity.record(tx, {
        boardId,
        userId,
        type: closed ? ACTIVITY_TYPES.BOARD_CLOSED : ACTIVITY_TYPES.BOARD_REOPENED,
        data: { boardTitle: updated.title },
      });
      return { board: updated, activity: record };
    });

    this.activity.publish(boardId, activity);
    return { board: toBoard(board) };
  }

  async setStarred(boardId: string, userId: string, starred: boolean) {
    await this.permissions.requireBoardView(boardId, userId);
    if (starred) {
      await this.prisma.boardStar.upsert({
        where: { boardId_userId: { boardId, userId } },
        create: { boardId, userId },
        update: {},
      });
    } else {
      await this.prisma.boardStar.deleteMany({ where: { boardId, userId } });
    }
    return { starred };
  }

  async addMember(boardId: string, actorId: string, body: AddBoardMemberBody) {
    const access = await this.permissions.requireBoardAdmin(boardId, actorId);

    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw AppError.notFound('User not found');

    const { member, activity, notifications } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.boardMember.upsert({
        where: { boardId_userId: { boardId, userId: body.userId } },
        create: { boardId, userId: body.userId, role: body.role ?? 'member' },
        update: { role: body.role ?? 'member' },
        include: { user: true },
      });
      const record = await this.activity.record(tx, {
        boardId,
        userId: actorId,
        type: ACTIVITY_TYPES.MEMBER_ADDED,
        data: { targetUserId: body.userId, targetName: user.name },
      });
      const notes = await this.notifications.record(tx, [
        {
          userId: body.userId,
          actorId,
          type: 'added_to_board',
          boardId,
          data: { boardTitle: access.board.title },
        },
      ]);
      return { member: created, activity: record, notifications: notes };
    });

    this.activity.publish(boardId, activity);
    this.notifications.publish(notifications);
    return { member: toBoardMember(member) };
  }

  async updateMemberRole(
    boardId: string,
    actorId: string,
    targetUserId: string,
    role: 'admin' | 'member' | 'observer',
  ) {
    await this.permissions.requireBoardAdmin(boardId, actorId);
    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!existing) throw AppError.notFound('Board member not found');

    if (existing.role === 'admin' && role !== 'admin') await this.assertNotLastAdmin(boardId);

    const member = await this.prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      data: { role },
      include: { user: true },
    });
    return { member: toBoardMember(member) };
  }

  async removeMember(boardId: string, actorId: string, targetUserId: string) {
    const access = await this.permissions.requireBoardView(boardId, actorId);
    // Admins remove anyone; anyone else may only remove themselves.
    if (!access.canAdmin && actorId !== targetUserId) {
      throw AppError.forbidden('Board admins only');
    }

    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!existing) throw AppError.notFound('Board member not found');
    if (existing.role === 'admin') await this.assertNotLastAdmin(boardId);

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.boardMember.delete({
        where: { boardId_userId: { boardId, userId: targetUserId } },
      });
      return this.activity.record(tx, {
        boardId,
        userId: actorId,
        type: ACTIVITY_TYPES.MEMBER_REMOVED,
        data: { targetUserId },
      });
    });

    this.activity.publish(boardId, activity);
    return { ok: true as const };
  }

  private async assertNotLastAdmin(boardId: string) {
    const admins = await this.prisma.boardMember.count({ where: { boardId, role: 'admin' } });
    if (admins <= 1) throw AppError.conflict('A board needs at least one admin');
  }
}

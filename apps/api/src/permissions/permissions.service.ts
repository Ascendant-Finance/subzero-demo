import { Injectable } from '@nestjs/common';
import type { Board, BoardRole, WorkspaceRole } from '@prisma/client';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';

export interface BoardAccess {
  board: Board;
  /** The caller's board role, or null when they only reach the board by visibility. */
  role: BoardRole | null;
  isWorkspaceMember: boolean;
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canAdmin: boolean;
}

/**
 * The single place the section 6.7 permission model lives. Reads check
 * visibility, mutations check board role.
 *
 * Open decision 2 resolved to the spec default: an observer may comment.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async workspaceMembership(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  async requireWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceRole> {
    const membership = await this.workspaceMembership(workspaceId, userId);
    if (!membership) throw AppError.forbidden('You are not a member of this workspace');
    return membership.role;
  }

  async requireWorkspaceAdmin(workspaceId: string, userId: string): Promise<void> {
    const role = await this.requireWorkspaceMember(workspaceId, userId);
    if (role !== 'admin') throw AppError.forbidden('Workspace admins only');
  }

  async boardAccess(boardId: string, userId: string): Promise<BoardAccess> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    if (!board) throw AppError.notFound('Board not found');
    return this.accessForBoard(board, userId);
  }

  async accessForBoard(board: Board, userId: string): Promise<BoardAccess> {
    const [membership, workspaceMembership] = await Promise.all([
      this.prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId: board.id, userId } },
      }),
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
      }),
    ]);

    const role = membership?.role ?? null;
    const isWorkspaceMember = Boolean(workspaceMembership);

    const canView =
      role !== null ||
      board.visibility === 'public' ||
      (board.visibility === 'workspace' && isWorkspaceMember);

    // Editing always requires board membership, whatever the visibility.
    const canEdit = role === 'admin' || role === 'member';
    const canAdmin = role === 'admin';
    const canComment = canEdit || role === 'observer';

    return { board, role, isWorkspaceMember, canView, canComment, canEdit, canAdmin };
  }

  async requireBoardView(boardId: string, userId: string): Promise<BoardAccess> {
    const access = await this.boardAccess(boardId, userId);
    // A board that does not exist is NOT_FOUND (thrown by boardAccess). One
    // that exists but is out of reach is FORBIDDEN, per the phase 3 acceptance
    // criterion for a non member hitting a private board.
    if (!access.canView) throw AppError.forbidden('You cannot view this board');
    return access;
  }

  async requireBoardEdit(boardId: string, userId: string): Promise<BoardAccess> {
    const access = await this.requireBoardView(boardId, userId);
    if (!access.canEdit) throw AppError.forbidden('You cannot edit this board');
    if (access.board.closed) throw AppError.forbidden('This board is closed');
    return access;
  }

  async requireBoardComment(boardId: string, userId: string): Promise<BoardAccess> {
    const access = await this.requireBoardView(boardId, userId);
    if (!access.canComment) throw AppError.forbidden('You cannot comment on this board');
    if (access.board.closed) throw AppError.forbidden('This board is closed');
    return access;
  }

  async requireBoardAdmin(boardId: string, userId: string): Promise<BoardAccess> {
    const access = await this.requireBoardView(boardId, userId);
    if (!access.canAdmin) throw AppError.forbidden('Board admins only');
    return access;
  }

  /** Resolves the board behind a list, then applies the board rules. */
  async requireListEdit(listId: string, userId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw AppError.notFound('List not found');
    const access = await this.requireBoardEdit(list.boardId, userId);
    return { list, access };
  }

  async requireListView(listId: string, userId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw AppError.notFound('List not found');
    const access = await this.requireBoardView(list.boardId, userId);
    return { list, access };
  }

  /** Resolves the board behind a card, then applies the board rules. */
  async requireCardEdit(cardId: string, userId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw AppError.notFound('Card not found');
    const access = await this.requireBoardEdit(card.boardId, userId);
    return { card, access };
  }

  async requireCardView(cardId: string, userId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw AppError.notFound('Card not found');
    const access = await this.requireBoardView(card.boardId, userId);
    return { card, access };
  }

  async requireCardComment(cardId: string, userId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw AppError.notFound('Card not found');
    const access = await this.requireBoardComment(card.boardId, userId);
    return { card, access };
  }
}

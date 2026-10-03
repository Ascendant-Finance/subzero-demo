import { Injectable } from '@nestjs/common';
import type { CreateInviteBody, CreateWorkspaceBody } from '@trello-clone/shared';
import { randomBytes } from 'node:crypto';
import { AppError } from '../common/app-error';
import { toBoard, toInvite, toWorkspace, toWorkspaceMember } from '../common/serialize';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(userId: string, body: CreateWorkspaceBody) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: body.name,
        slug: await this.uniqueSlug(body.name),
        members: { create: { userId, role: 'admin' } },
      },
    });
    return { workspace: toWorkspace(workspace) };
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
    return { workspaces: rows.map(toWorkspace) };
  }

  async detail(workspaceId: string, userId: string) {
    await this.permissions.requireWorkspaceMember(workspaceId, userId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: { include: { user: true }, orderBy: { joinedAt: 'asc' } } },
    });
    if (!workspace) throw AppError.notFound('Workspace not found');

    // Workspace and public boards, plus any private board the caller belongs to.
    const boards = await this.prisma.board.findMany({
      where: {
        workspaceId,
        OR: [
          { visibility: { in: ['workspace', 'public'] } },
          { members: { some: { userId } } },
        ],
      },
      include: { stars: { where: { userId }, select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      workspace: toWorkspace(workspace),
      members: workspace.members.map(toWorkspaceMember),
      boards: boards.map((board) => toBoard(board, board.stars.length > 0)),
    };
  }

  async createInvite(workspaceId: string, userId: string, body: CreateInviteBody) {
    await this.permissions.requireWorkspaceAdmin(workspaceId, userId);
    const invite = await this.prisma.invite.create({
      data: {
        workspaceId,
        code: randomBytes(9).toString('base64url'),
        email: body.email ?? null,
        role: body.role ?? 'member',
        createdById: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return { invite: toInvite(invite) };
  }

  async join(userId: string, code: string) {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    if (!invite) throw AppError.notFound('Invite not found');
    if (invite.expiresAt.getTime() < Date.now()) throw AppError.forbidden('This invite has expired');

    const workspace = await this.prisma.workspace.findUnique({ where: { id: invite.workspaceId } });
    if (!workspace) throw AppError.notFound('Workspace not found');

    const existing = await this.permissions.workspaceMembership(invite.workspaceId, userId);
    if (!existing) {
      await this.prisma.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId, role: invite.role },
      });
    }
    return { workspace: toWorkspace(workspace) };
  }

  private async uniqueSlug(name: string) {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'workspace';
    let slug = base;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const clash = await this.prisma.workspace.findUnique({ where: { slug } });
      if (!clash) return slug;
      slug = `${base}-${randomBytes(3).toString('hex')}`;
    }
    throw AppError.conflict('Could not allocate a workspace slug');
  }
}

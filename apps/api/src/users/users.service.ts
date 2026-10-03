import { Injectable } from '@nestjs/common';
import { toPublicUser } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Directory lookup used by the invite and add member flows. Limited to users
   * who share a workspace with the caller.
   */
  async search(callerId: string, query: string) {
    const term = query.trim();
    if (term.length < 2) return { users: [] };

    const workspaces = await this.prisma.workspaceMember.findMany({
      where: { userId: callerId },
      select: { workspaceId: true },
    });
    const workspaceIds = workspaces.map((row) => row.workspaceId);
    if (!workspaceIds.length) return { users: [] };

    const users = await this.prisma.user.findMany({
      where: {
        workspaceMemberships: { some: { workspaceId: { in: workspaceIds } } },
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 10,
    });
    return { users: users.map(toPublicUser) };
  }
}

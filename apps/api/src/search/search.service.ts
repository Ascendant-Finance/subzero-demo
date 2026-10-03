import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BoardSearchQuery } from '@trello-clone/shared';
import { loadCardAggregates } from '../cards/card-aggregates';
import { toCard } from '../common/serialize';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

type ParsedQuery = {
  q?: string;
  labelIds?: string[];
  memberIds?: string[];
  due?: 'overdue' | 'day' | 'week' | 'month' | 'none' | 'complete' | 'incomplete';
};

const DUE_WINDOWS: Record<string, number> = {
  day: 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Board scoped card search. Filters combine; text uses the tsvector index. */
  async searchBoard(boardId: string, userId: string, query: BoardSearchQuery) {
    await this.permissions.requireBoardView(boardId, userId);
    const parsed = query as ParsedQuery;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`c."boardId" = ${boardId}`,
      Prisma.sql`c.archived = false`,
    ];

    const text = parsed.q?.trim();
    if (text) {
      conditions.push(
        Prisma.sql`c."searchVector" @@ websearch_to_tsquery('english', ${text})`,
      );
    }

    if (parsed.labelIds?.length) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "CardLabel" cl
        WHERE cl."cardId" = c.id AND cl."labelId" IN (${Prisma.join(parsed.labelIds)})
      )`);
    }

    if (parsed.memberIds?.length) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "CardMember" cm
        WHERE cm."cardId" = c.id AND cm."userId" IN (${Prisma.join(parsed.memberIds)})
      )`);
    }

    const dueClause = this.dueCondition(parsed.due);
    if (dueClause) conditions.push(dueClause);

    const where = Prisma.join(conditions, ' AND ');
    const rank = text
      ? Prisma.sql`ts_rank(c."searchVector", websearch_to_tsquery('english', ${text})) DESC,`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "Card" c
      WHERE ${where}
      ORDER BY ${rank} c."createdAt" DESC
      LIMIT 100`;

    const ids = rows.map((row) => row.id);
    if (!ids.length) return { cards: [] };

    const cards = await this.prisma.card.findMany({ where: { id: { in: ids } } });
    const aggregates = await loadCardAggregates(this.prisma, ids);
    const byId = new Map(cards.map((card) => [card.id, card]));

    return {
      cards: ids
        .map((id) => byId.get(id))
        .filter((card): card is NonNullable<typeof card> => Boolean(card))
        .map((card) => toCard(card, aggregates.get(card.id) ?? {})),
    };
  }

  private dueCondition(due: ParsedQuery['due']): Prisma.Sql | null {
    if (!due) return null;
    const now = new Date();
    switch (due) {
      case 'none':
        return Prisma.sql`c."dueAt" IS NULL`;
      case 'complete':
        return Prisma.sql`c."dueComplete" = true`;
      case 'incomplete':
        return Prisma.sql`c."dueAt" IS NOT NULL AND c."dueComplete" = false`;
      case 'overdue':
        return Prisma.sql`c."dueAt" < ${now} AND c."dueComplete" = false`;
      default: {
        const until = new Date(now.getTime() + DUE_WINDOWS[due]);
        return Prisma.sql`c."dueAt" IS NOT NULL AND c."dueAt" <= ${until} AND c."dueComplete" = false`;
      }
    }
  }
}

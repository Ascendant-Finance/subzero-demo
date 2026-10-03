import type { Card as CardRow } from '@prisma/client';
import type { CardAggregates } from '../common/serialize';
import type { Tx } from '../common/prisma-tx';

/**
 * Board level card badges: labels, assignees, and the counts the card front
 * renders. Loaded in one pass per board rather than per card.
 */
export async function loadCardAggregates(
  tx: Tx,
  cardIds: string[],
): Promise<Map<string, CardAggregates>> {
  const result = new Map<string, CardAggregates>();
  if (!cardIds.length) return result;
  // Cards are read in pages; the badge queries below take the whole set.
  const page = cardIds.slice(0, 50);

  const [labels, members, comments, attachments, checklists] = await Promise.all([
    tx.cardLabel.findMany({ where: { cardId: { in: cardIds } } }),
    tx.cardMember.findMany({ where: { cardId: { in: cardIds } } }),
    tx.comment.groupBy({ by: ['cardId'], where: { cardId: { in: cardIds } }, _count: true }),
    tx.attachment.groupBy({ by: ['cardId'], where: { cardId: { in: cardIds } }, _count: true }),
    tx.checklist.findMany({
      where: { cardId: { in: cardIds } },
      select: { cardId: true, items: { select: { completed: true } } },
    }),
  ]);

  const ensure = (cardId: string): CardAggregates => {
    let entry = result.get(cardId);
    if (!entry) {
      entry = {
        labelIds: [],
        memberIds: [],
        commentCount: 0,
        attachmentCount: 0,
        checklistTotal: 0,
        checklistDone: 0,
      };
      result.set(cardId, entry);
    }
    return entry;
  };

  page.forEach(ensure);
  labels.forEach((row) => ensure(row.cardId).labelIds!.push(row.labelId));
  members.forEach((row) => ensure(row.cardId).memberIds!.push(row.userId));
  comments.forEach((row: any) => {
    ensure(row.cardId).commentCount = row._count;
  });
  attachments.forEach((row: any) => {
    ensure(row.cardId).attachmentCount = row._count;
  });
  checklists.forEach((row) => {
    const entry = result.get(row.cardId)!;
    entry.checklistTotal! += row.items.length;
    entry.checklistDone! += row.items.filter((item) => item.completed).length;
  });

  return result;
}

/** Aggregates for a single card, used after a mutation that changes badges. */
export async function aggregatesFor(tx: Tx, card: CardRow) {
  const map = await loadCardAggregates(tx, [card.id]);
  return map.get(card.id) ?? {};
}

import type { Prisma } from '@prisma/client';
import { DEFAULT_LABELS, seedPositions } from '@trello-clone/shared';
import { randomBytes } from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;

/** The records the warm-up needs to drive each fault once. */
export interface DemoSeed {
  workspaceId: string;
  roadmapBoardId: string;
  describedCardId: string;
  emptyChecklistId: string;
  movableCardId: string;
  doneListId: string;
  otherTodoCardId: string;
  backlogBoardId: string;
}

/**
 * Gives a new prospect a workspace that looks lived in: a roadmap board to use,
 * and a support backlog big enough to be a real team's.
 *
 * The shapes here are what an ordinary team ends up with — cards with notes,
 * a checklist nobody has started, a due date this week, a backlog past fifty
 * cards — so every fault in the API is reachable from the moment they sign in.
 */
export async function seedDemoWorkspace(
  tx: Prisma.TransactionClient,
  user: { id: string; name: string },
): Promise<DemoSeed> {
  const firstName = user.name.split(/\s+/)[0] || 'Your';
  const workspace = await tx.workspace.create({
    data: {
      name: `${firstName}'s team`,
      slug: `demo-${randomBytes(5).toString('hex')}`,
      members: { create: [{ userId: user.id, role: 'admin' }] },
    },
  });

  const roadmap = await tx.board.create({
    data: {
      workspaceId: workspace.id,
      title: 'Product Roadmap',
      description: 'What we are building this quarter.',
      visibility: 'workspace',
      bgType: 'color',
      bgValue: '#1d4ed8',
      createdById: user.id,
      members: { create: [{ userId: user.id, role: 'admin' }] },
      labels: { create: DEFAULT_LABELS.map((l) => ({ name: l.name, color: l.color })) },
    },
    include: { labels: true },
  });

  const [todo, doing, done] = await Promise.all(
    ['To Do', 'Doing', 'Done'].map((title, i) =>
      tx.list.create({ data: { boardId: roadmap.id, title, position: seedPositions(3)[i] } }),
    ),
  );

  const green = roadmap.labels.find((l) => l.color === '#61bd4f') ?? roadmap.labels[0];
  const red = roadmap.labels.find((l) => l.color === '#eb5a46') ?? roadmap.labels[1];
  const todoPositions = seedPositions(4);

  const research = await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: todo.id,
      title: 'Research competitor onboarding',
      description: 'Compare the first run experience of three tools.\n\n- signup\n- empty state',
      position: todoPositions[0],
      createdById: user.id,
      dueAt: new Date(Date.now() + 3 * DAY),
      labels: { create: [{ labelId: green.id }, { labelId: red.id }] },
      members: { create: [{ userId: user.id }] },
    },
  });
  await tx.checklist.create({
    data: {
      cardId: research.id,
      title: 'Steps',
      position: seedPositions(1)[0],
      items: {
        create: seedPositions(3).map((position, i) => ({
          text: ['Pick three tools', 'Capture screenshots', 'Write the summary'][i],
          position,
          completed: i === 0,
        })),
      },
    },
  });

  const pricing = await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: todo.id,
      title: 'Draft the pricing page copy',
      description: 'Three tiers. Lead with the free plan.',
      position: todoPositions[1],
      createdById: user.id,
      dueAt: new Date(Date.now() + 5 * DAY),
    },
  });

  const launch = await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: todo.id,
      title: 'Plan the public launch',
      position: todoPositions[2],
      createdById: user.id,
      labels: { create: [{ labelId: red.id }] },
    },
  });
  const launchChecklist = await tx.checklist.create({
    data: { cardId: launch.id, title: 'Launch checklist', position: seedPositions(1)[0] },
  });

  const flicker = await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: todo.id,
      title: 'Fix the drag placeholder flicker',
      position: todoPositions[3],
      createdById: user.id,
    },
  });

  const doingPositions = seedPositions(2);
  await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: doing.id,
      title: 'Build the board bootstrap endpoint',
      description: 'One query set for lists, cards, labels and members.',
      position: doingPositions[0],
      createdById: user.id,
      members: { create: [{ userId: user.id }] },
    },
  });
  await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: doing.id,
      title: 'Wire realtime presence avatars',
      position: doingPositions[1],
      createdById: user.id,
    },
  });
  await tx.card.create({
    data: {
      boardId: roadmap.id,
      listId: done.id,
      title: 'Pick the ordering strategy',
      description: 'Fractional indexing, server authoritative.',
      position: seedPositions(1)[0],
      createdById: user.id,
      dueAt: new Date(Date.now() - 2 * DAY),
      dueComplete: true,
    },
  });
  await tx.activity.create({
    data: {
      boardId: roadmap.id,
      userId: user.id,
      type: 'board.created',
      data: { boardTitle: roadmap.title },
    },
  });

  const backlog = await tx.board.create({
    data: {
      workspaceId: workspace.id,
      title: 'Support backlog',
      description: 'Everything customers have asked for. Triage on Mondays.',
      visibility: 'workspace',
      bgType: 'color',
      bgValue: '#0f766e',
      createdById: user.id,
      members: { create: [{ userId: user.id, role: 'admin' }] },
      labels: { create: DEFAULT_LABELS.map((l) => ({ name: l.name, color: l.color })) },
    },
    include: { labels: true },
  });
  const inbox = await tx.list.create({
    data: { boardId: backlog.id, title: 'Inbox', position: seedPositions(1)[0] },
  });
  const requests = [
    'CSV export', 'Dark mode', 'SSO via Okta', 'Bulk archive', 'Keyboard shortcuts',
    'Slack digest', 'Card templates', 'Recurring cards', 'Board permissions audit', 'Mobile push',
  ];
  const positions = seedPositions(64);
  for (let i = 0; i < positions.length; i++) {
    const card = await tx.card.create({
      data: {
        boardId: backlog.id,
        listId: inbox.id,
        title: `${requests[i % requests.length]} (request #${1040 + i})`,
        position: positions[i],
        createdById: user.id,
        // Triage labels only the oldest requests; the rest arrive bare.
        ...(i < 30 ? { labels: { create: [{ labelId: backlog.labels[i % backlog.labels.length].id }] } } : {}),
      },
    });
    if (i % 4 === 0) {
      await tx.checklist.create({
        data: {
          cardId: card.id,
          title: 'Triage',
          position: seedPositions(1)[0],
          items: { create: [{ text: 'Reproduce', position: seedPositions(1)[0] }] },
        },
      });
    }
  }

  return {
    workspaceId: workspace.id,
    roadmapBoardId: roadmap.id,
    describedCardId: pricing.id,
    emptyChecklistId: launchChecklist.id,
    movableCardId: flicker.id,
    doneListId: done.id,
    otherTodoCardId: research.id,
    backlogBoardId: backlog.id,
  };
}

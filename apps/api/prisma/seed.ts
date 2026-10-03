import { PrismaClient } from '@prisma/client';
import { DEFAULT_LABELS, seedPositions } from '@trello-clone/shared';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('seeding');

  await prisma.workspace.deleteMany({ where: { slug: 'acme' } });
  await prisma.user.deleteMany({
    where: { email: { in: ['ada@example.com', 'grace@example.com'] } },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  const ada = await prisma.user.create({
    data: { email: 'ada@example.com', name: 'Ada Lovelace', passwordHash },
  });
  const grace = await prisma.user.create({
    data: { email: 'grace@example.com', name: 'Grace Hopper', passwordHash },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Acme',
      slug: 'acme',
      members: {
        create: [
          { userId: ada.id, role: 'admin' },
          { userId: grace.id, role: 'member' },
        ],
      },
    },
  });

  const board = await prisma.board.create({
    data: {
      workspaceId: workspace.id,
      title: 'Product Roadmap',
      description: 'What we are building this quarter.',
      visibility: 'workspace',
      bgType: 'color',
      bgValue: '#1d4ed8',
      createdById: ada.id,
      members: {
        create: [
          { userId: ada.id, role: 'admin' },
          { userId: grace.id, role: 'member' },
        ],
      },
      labels: { create: DEFAULT_LABELS.map((l) => ({ name: l.name, color: l.color })) },
    },
    include: { labels: true },
  });

  const listPositions = seedPositions(3);
  const [todo, doing, done] = await Promise.all(
    ['To Do', 'Doing', 'Done'].map((title, i) =>
      prisma.list.create({
        data: { boardId: board.id, title, position: listPositions[i] },
      }),
    ),
  );

  const green = board.labels.find((l) => l.color === '#61bd4f')!;
  const red = board.labels.find((l) => l.color === '#eb5a46')!;

  const todoPositions = seedPositions(3);
  const dueSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const research = await prisma.card.create({
    data: {
      boardId: board.id,
      listId: todo.id,
      title: 'Research competitor onboarding',
      description: 'Compare the first run experience of three tools.\n\n- signup\n- empty state',
      position: todoPositions[0],
      createdById: ada.id,
      dueAt: dueSoon,
      labels: { create: [{ labelId: green.id }, { labelId: red.id }] },
      members: { create: [{ userId: grace.id }] },
    },
  });

  await prisma.checklist.create({
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

  await prisma.comment.create({
    data: {
      cardId: research.id,
      userId: ada.id,
      text: 'Adding @Grace Hopper here since she owns onboarding.',
    },
  });

  await prisma.notification.create({
    data: {
      userId: grace.id,
      actorId: ada.id,
      type: 'mention',
      boardId: board.id,
      cardId: research.id,
      data: { cardTitle: research.title, boardTitle: board.title },
    },
  });

  await prisma.card.create({
    data: {
      boardId: board.id,
      listId: todo.id,
      title: 'Draft the pricing page copy',
      position: todoPositions[1],
      createdById: grace.id,
    },
  });

  await prisma.card.create({
    data: {
      boardId: board.id,
      listId: todo.id,
      title: 'Fix the drag placeholder flicker',
      position: todoPositions[2],
      createdById: ada.id,
      labels: { create: [{ labelId: red.id }] },
    },
  });

  const doingPositions = seedPositions(2);
  await prisma.card.create({
    data: {
      boardId: board.id,
      listId: doing.id,
      title: 'Build the board bootstrap endpoint',
      description: 'One query set for lists, cards, labels and members.',
      position: doingPositions[0],
      createdById: ada.id,
      members: { create: [{ userId: ada.id }] },
    },
  });
  await prisma.card.create({
    data: {
      boardId: board.id,
      listId: doing.id,
      title: 'Wire realtime presence avatars',
      position: doingPositions[1],
      createdById: grace.id,
    },
  });

  await prisma.card.create({
    data: {
      boardId: board.id,
      listId: done.id,
      title: 'Pick the ordering strategy',
      description: 'Fractional indexing, server authoritative.',
      position: seedPositions(1)[0],
      createdById: ada.id,
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueComplete: true,
    },
  });

  await prisma.activity.create({
    data: {
      boardId: board.id,
      userId: ada.id,
      type: 'board.created',
      data: { boardTitle: board.title },
    },
  });

  console.log('seeded users ada@example.com and grace@example.com with password password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

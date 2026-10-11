import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  auth,
  closeApp,
  createCard,
  createList,
  createTestApp,
  registerUser,
  seedBoard,
} from './helpers';

describe('guided reviewed Cocoa repair', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fetchMock: jest.SpyInstance;
  beforeAll(async () => {
    process.env.DEMO_PROVISION_SECRET = 's'.repeat(32);
    process.env.SUBZERO_DEMO_PROVISION_URL = 'https://coordinator.example.test/demo/provision';
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    fetchMock?.mockRestore();
    await closeApp(app);
  });
  it('applies only to the prospect board, verifies real persistence, retries without spending and resets', async () => {
    const owner = await registerUser(app, 'Cocoa Owner');
    const other = await registerUser(app, 'Cocoa Other');
    const ownBoard = await seedBoard(app, owner, 'Product Roadmap');
    const foreignBoard = await seedBoard(app, other, 'Product Roadmap');
    const extraBoard = await seedBoard(app, owner, 'Unrepaired Board');
    const own = await createCard(
      app,
      owner,
      (await createList(app, owner, ownBoard.boardId, 'Tasks')).id,
      'Keep this title',
    );
    const foreign = await createCard(
      app,
      other,
      (await createList(app, other, foreignBoard.boardId, 'Tasks')).id,
      'Other prospect',
    );
    const extra = await createCard(
      app,
      owner,
      (await createList(app, owner, extraBoard.boardId, 'Tasks')).id,
      'Other board',
    );
    for (const [user, project] of [
      [owner, 'GUIDED-A'],
      [other, 'GUIDED-B'],
    ] as const)
      await prisma.demoTenant.create({
        data: {
          userId: user.id,
          subzeroProjectKey: project + user.id,
          subzeroIngestKey: 'test-only',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    let run: Record<string, unknown> | null = null;
    let diagnoses = 0,
      completions = 0;
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/incidents/external')) return new Response('{}', { status: 200 });
      expect(url).toContain('GUIDED-A' + owner.id);
      if (url.endsWith('/start') && !run) {
        diagnoses++;
        run = {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'ready',
          stage: 'ready',
          repairId: 'clear-card-description-v1',
          ticketCode: 'GUIDED-A-1',
          cause: 'Null description',
          summary: 'Reviewed null handling',
        };
      }
      if (url.endsWith('/complete')) {
        const t = await prisma.demoTenant.findUniqueOrThrow({ where: { userId: owner.id } });
        expect(t.cocoaVerification).toMatchObject({ passed: true });
        const card = await prisma.card.findUniqueOrThrow({ where: { id: t.cocoaSampleCardId! } });
        expect(card.description).toBeNull();
        completions++;
        run = { ...run, status: 'completed', stage: 'completed' };
      }
      return new Response(
        JSON.stringify({
          available: true,
          incidentReady: true,
          attemptsRemaining: run ? 1 : 2,
          run,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    await api(app)
      .patch(`/api/cards/${own.id}`)
      .set(auth(owner))
      .send({ description: null })
      .expect(500);
    await api(app).post('/api/demo/cocoa/start').expect(401);
    const started = await api(app)
      .post('/api/demo/cocoa/start')
      .set(auth(owner))
      .send({ project: 'GUIDED-B', repairId: 'untrusted' })
      .expect(201);
    expect(started.body.repairApplied).toBe(true);
    expect(started.body.boardId).toBe(ownBoard.boardId);
    expect(started.body.preview.passed).toBe(true);
    await api(app).post('/api/demo/cocoa/start').set(auth(owner)).expect(201);
    expect(diagnoses).toBe(1);
    expect(completions).toBe(1);
    const repaired = await api(app)
      .patch(`/api/cards/${own.id}`)
      .set(auth(owner))
      .send({ description: null })
      .expect(200);
    expect(repaired.body.card.description).toBeNull();
    expect(repaired.body.card.title).toBe('Keep this title');
    const trimmed = await api(app)
      .patch(`/api/cards/${own.id}`)
      .set(auth(owner))
      .send({ description: '  Notes  ' })
      .expect(200);
    expect(trimmed.body.card.description).toBe('Notes');
    const omitted = await api(app)
      .patch(`/api/cards/${own.id}`)
      .set(auth(owner))
      .send({ title: 'New title' })
      .expect(200);
    expect(omitted.body.card.description).toBe('Notes');
    await api(app)
      .patch(`/api/cards/${foreign.id}`)
      .set(auth(other))
      .send({ description: null })
      .expect(500);
    await api(app)
      .patch(`/api/cards/${extra.id}`)
      .set(auth(owner))
      .send({ description: null })
      .expect(500);
    await api(app)
      .patch(`/api/cards/${own.id}`)
      .set(auth(other))
      .send({ description: null })
      .expect(403);
    await api(app).post('/api/demo/cocoa/preview').set(auth(owner)).expect(201);
    await api(app).post('/api/demo/cocoa/reset').set(auth(owner)).expect(201);
    await api(app)
      .patch(`/api/cards/${own.id}`)
      .set(auth(owner))
      .send({ description: null })
      .expect(500);
    await api(app).post('/api/demo/cocoa/preview').set(auth(owner)).expect(409);
    expect(diagnoses).toBe(1);
    await prisma.demoTenant.update({
      where: { userId: owner.id },
      data: { expiresAt: new Date(0) },
    });
    await api(app).post('/api/demo/cocoa/start').set(auth(owner)).expect(403);
  });
});

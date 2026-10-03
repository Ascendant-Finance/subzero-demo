import { INestApplication } from '@nestjs/common';
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

describe('activity, notifications and search (phase 7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  it('records board activity for every mutation and pages it', async () => {
    const user = await registerUser(app, 'Activity Owner');
    const { boardId } = await seedBoard(app, user, 'Busy Board');
    const list = await createList(app, user, boardId, 'Tasks');
    const card = await createCard(app, user, list.id, 'Track me');
    await api(app)
      .patch(`/api/cards/${card.id}`)
      .set(auth(user))
      .send({ title: 'Tracked' })
      .expect(200);

    const feed = await api(app)
      .get(`/api/boards/${boardId}/activity`)
      .set(auth(user))
      .expect(200);

    const types = feed.body.activities.map((a: any) => a.type);
    expect(types).toEqual(
      expect.arrayContaining(['board.created', 'list.created', 'card.created', 'card.updated']),
    );
    expect(feed.body.activities[0].user.id).toBe(user.id);
    expect(feed.body).toHaveProperty('nextCursor');

    const firstPage = await api(app)
      .get(`/api/boards/${boardId}/activity?limit=2`)
      .set(auth(user))
      .expect(200);
    expect(firstPage.body.activities).toHaveLength(2);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await api(app)
      .get(`/api/boards/${boardId}/activity?limit=2&cursor=${firstPage.body.nextCursor}`)
      .set(auth(user))
      .expect(200);
    const firstIds = firstPage.body.activities.map((a: any) => a.id);
    const secondIds = secondPage.body.activities.map((a: any) => a.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it('records card scoped activity', async () => {
    const user = await registerUser(app, 'Card Activity');
    const { boardId } = await seedBoard(app, user, 'Card Feed');
    const list = await createList(app, user, boardId, 'Tasks');
    const card = await createCard(app, user, list.id, 'Watch me');
    await api(app)
      .post(`/api/cards/${card.id}/comments`)
      .set(auth(user))
      .send({ text: 'first note' })
      .expect(201);

    const feed = await api(app).get(`/api/cards/${card.id}/activity`).set(auth(user)).expect(200);
    const types = feed.body.activities.map((a: any) => a.type);
    expect(types).toContain('comment.created');
    expect(types).toContain('card.created');
    expect(feed.body.activities.every((a: any) => a.cardId === card.id)).toBe(true);
  });

  it('marks every notification read at once', async () => {
    const author = await registerUser(app, 'Notifier');
    const target = await registerUser(app, 'Ada Lovelace');
    const { boardId } = await seedBoard(app, author, 'Notify');
    const list = await createList(app, author, boardId, 'Tasks');
    const card = await createCard(app, author, list.id, 'Ping');

    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(author))
      .send({ userId: target.id, role: 'member' })
      .expect(201);
    await api(app)
      .post(`/api/cards/${card.id}/comments`)
      .set(auth(author))
      .send({ text: 'over to @Ada Lovelace' })
      .expect(201);

    const before = await api(app).get('/api/notifications').set(auth(target)).expect(200);
    expect(before.body.notifications.some((n: any) => !n.read)).toBe(true);

    await api(app).post('/api/notifications/read-all').set(auth(target)).expect(201);

    const after = await api(app).get('/api/notifications').set(auth(target)).expect(200);
    expect(after.body.notifications.every((n: any) => n.read)).toBe(true);
  });

  it('searches board cards by text over the tsvector index', async () => {
    const user = await registerUser(app, 'Searcher');
    const { boardId } = await seedBoard(app, user, 'Searchable');
    const list = await createList(app, user, boardId, 'Tasks');
    await createCard(app, user, list.id, 'Refactor the billing pipeline');
    const target = await createCard(app, user, list.id, 'Write onboarding documentation');
    await api(app)
      .patch(`/api/cards/${target.id}`)
      .set(auth(user))
      .send({ description: 'Covers the signup funnel end to end' })
      .expect(200);

    const byTitle = await api(app)
      .get(`/api/boards/${boardId}/search?q=onboarding`)
      .set(auth(user))
      .expect(200);
    expect(byTitle.body.cards.map((c: any) => c.id)).toEqual([target.id]);

    // Stemming: the index also matches a different form of the word.
    const stemmed = await api(app)
      .get(`/api/boards/${boardId}/search?q=documented`)
      .set(auth(user))
      .expect(200);
    expect(stemmed.body.cards.map((c: any) => c.id)).toEqual([target.id]);

    const byDescription = await api(app)
      .get(`/api/boards/${boardId}/search?q=funnel`)
      .set(auth(user))
      .expect(200);
    expect(byDescription.body.cards.map((c: any) => c.id)).toEqual([target.id]);

    const noMatch = await api(app)
      .get(`/api/boards/${boardId}/search?q=kubernetes`)
      .set(auth(user))
      .expect(200);
    expect(noMatch.body.cards).toHaveLength(0);
  });

  it('combines label, member and due filters', async () => {
    const owner = await registerUser(app, 'Filter Owner');
    const mate = await registerUser(app, 'Filter Mate');
    const { boardId } = await seedBoard(app, owner, 'Filters');
    const list = await createList(app, owner, boardId, 'Tasks');

    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: mate.id, role: 'member' })
      .expect(201);

    const bootstrap = await api(app).get(`/api/boards/${boardId}`).set(auth(owner)).expect(200);
    const [green, red] = bootstrap.body.labels;

    const wanted = await createCard(app, owner, list.id, 'Wanted card');
    const labelledOnly = await createCard(app, owner, list.id, 'Labelled only');
    const memberOnly = await createCard(app, owner, list.id, 'Member only');
    await createCard(app, owner, list.id, 'Plain card');

    for (const [cardId, labelId] of [
      [wanted.id, green.id],
      [labelledOnly.id, green.id],
      [memberOnly.id, red.id],
    ]) {
      await api(app)
        .post(`/api/cards/${cardId}/labels`)
        .set(auth(owner))
        .send({ labelId })
        .expect(201);
    }
    for (const cardId of [wanted.id, memberOnly.id]) {
      await api(app)
        .post(`/api/cards/${cardId}/members`)
        .set(auth(owner))
        .send({ userId: mate.id })
        .expect(201);
    }

    const combined = await api(app)
      .get(`/api/boards/${boardId}/search?labelIds=${green.id}&memberIds=${mate.id}`)
      .set(auth(owner))
      .expect(200);
    expect(combined.body.cards.map((c: any) => c.id)).toEqual([wanted.id]);

    const overdue = new Date(Date.now() - 86400000).toISOString();
    await api(app)
      .patch(`/api/cards/${labelledOnly.id}`)
      .set(auth(owner))
      .send({ dueAt: overdue })
      .expect(200);

    const overdueResults = await api(app)
      .get(`/api/boards/${boardId}/search?due=overdue`)
      .set(auth(owner))
      .expect(200);
    expect(overdueResults.body.cards.map((c: any) => c.id)).toEqual([labelledOnly.id]);

    const noDue = await api(app)
      .get(`/api/boards/${boardId}/search?due=none&labelIds=${red.id}`)
      .set(auth(owner))
      .expect(200);
    expect(noDue.body.cards.map((c: any) => c.id)).toEqual([memberOnly.id]);
  });

  it('scopes search to boards the caller can reach', async () => {
    const owner = await registerUser(app, 'Private Owner');
    const stranger = await registerUser(app, 'Nosy Stranger');
    const { boardId } = await seedBoard(app, owner, 'Secret');
    const list = await createList(app, owner, boardId, 'Tasks');
    await createCard(app, owner, list.id, 'Confidential plan');

    await api(app)
      .patch(`/api/boards/${boardId}`)
      .set(auth(owner))
      .send({ visibility: 'private' })
      .expect(200);

    await api(app)
      .get(`/api/boards/${boardId}/search?q=confidential`)
      .set(auth(stranger))
      .expect(403);
  });
});

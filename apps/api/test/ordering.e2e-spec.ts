import { INestApplication } from '@nestjs/common';
import { needsRebalance, positionBetween } from '@trello-clone/shared';
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
  type TestUser,
} from './helpers';

/** Cards of a list, in the order the server considers authoritative. */
async function listOrder(app: INestApplication, user: TestUser, boardId: string, listId: string) {
  const response = await api(app).get(`/api/boards/${boardId}`).set(auth(user)).expect(200);
  return response.body.cards
    .filter((card: any) => card.listId === listId)
    .sort((a: any, b: any) => (a.position < b.position ? -1 : 1));
}

describe('ordering engine (phase 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await closeApp(app);
  });

  it('appends new lists and cards to the end of their scope', async () => {
    const user = await registerUser(app, 'Append User');
    const { boardId } = await seedBoard(app, user, 'Appending');

    const first = await createList(app, user, boardId, 'First');
    const second = await createList(app, user, boardId, 'Second');
    expect(first.position < second.position).toBe(true);

    const a = await createCard(app, user, first.id, 'A');
    const b = await createCard(app, user, first.id, 'B');
    expect(a.position < b.position).toBe(true);
  });

  it('moves a card to the middle of another list at a server computed position', async () => {
    const user = await registerUser(app, 'Mover');
    const { boardId } = await seedBoard(app, user, 'Moving');
    const source = await createList(app, user, boardId, 'Source');
    const target = await createList(app, user, boardId, 'Target');

    const moving = await createCard(app, user, source.id, 'Moving card');
    const top = await createCard(app, user, target.id, 'Top');
    const bottom = await createCard(app, user, target.id, 'Bottom');

    const response = await api(app)
      .post(`/api/cards/${moving.id}/move`)
      .set(auth(user))
      .send({ targetListId: target.id, beforeCardId: top.id, afterCardId: bottom.id })
      .expect(201);

    const moved = response.body.card;
    expect(moved.listId).toBe(target.id);
    expect(moved.position > top.position).toBe(true);
    expect(moved.position < bottom.position).toBe(true);

    const order = await listOrder(app, user, boardId, target.id);
    expect(order.map((card: any) => card.title)).toEqual(['Top', 'Moving card', 'Bottom']);
  });

  it('ignores any position the client tries to send', async () => {
    const user = await registerUser(app, 'Sneaky Client');
    const { boardId } = await seedBoard(app, user, 'Server Owned');
    const list = await createList(app, user, boardId, 'Only list');
    const first = await createCard(app, user, list.id, 'First');
    const second = await createCard(app, user, list.id, 'Second');

    const response = await api(app)
      .post(`/api/cards/${second.id}/move`)
      .set(auth(user))
      .send({
        targetListId: list.id,
        beforeCardId: null,
        afterCardId: first.id,
        position: 'zzz-client-supplied',
      })
      .expect(201);

    expect(response.body.card.position).not.toBe('zzz-client-supplied');
    expect(response.body.card.position < first.position).toBe(true);
  });

  it('keeps order across 60 sequential inserts into one gap', async () => {
    const user = await registerUser(app, 'Gap Filler');
    const { boardId } = await seedBoard(app, user, 'Deep Gap');
    const list = await createList(app, user, boardId, 'Stack');

    const top = await createCard(app, user, list.id, 'Top');
    const bottom = await createCard(app, user, list.id, 'Bottom');

    // Every insert drops directly beneath Top, into the same shrinking gap.
    for (let i = 0; i < 60; i += 1) {
      const card = await createCard(app, user, list.id, `Filler ${i}`);
      await api(app)
        .post(`/api/cards/${card.id}/move`)
        .set(auth(user))
        .send({ targetListId: list.id, beforeCardId: top.id, afterCardId: null })
        .expect(201);
    }

    const order = await listOrder(app, user, boardId, list.id);
    expect(order).toHaveLength(62);
    expect(order[0].title).toBe('Top');
    expect(order[order.length - 1].title).toBe('Bottom');

    const positions = order.map((card: any) => card.position);
    expect([...positions].sort()).toEqual(positions);
    expect(new Set(positions).size).toBe(positions.length);

    // Most recent insert sits closest to Top.
    expect(order[1].title).toBe('Filler 59');
  });

  it('rebalances a scope once a computed key passes the 50 character threshold', async () => {
    const user = await registerUser(app, 'Rebalancer');
    const { boardId } = await seedBoard(app, user, 'Rebalance');
    const list = await createList(app, user, boardId, 'Tight');

    const top = await createCard(app, user, list.id, 'Top');
    const bottom = await createCard(app, user, list.id, 'Bottom');
    const dropping = await createCard(app, user, list.id, 'Dropping');

    // Drive two neighbours so close together that the next key between them
    // must exceed the locked 50 character threshold. Sixty ordinary inserts
    // only reach about fourteen characters, so the gap is planted directly.
    const low = 'a0';
    let high = 'a1';
    let between = positionBetween(low, high);
    while (!needsRebalance(between)) {
      high = between;
      between = positionBetween(low, high);
    }
    expect(between.length).toBeGreaterThan(50);

    await prisma.card.update({ where: { id: dropping.id }, data: { position: 'a2' } });
    await prisma.card.update({ where: { id: top.id }, data: { position: low } });
    await prisma.card.update({ where: { id: bottom.id }, data: { position: high } });

    const response = await api(app)
      .post(`/api/cards/${dropping.id}/move`)
      .set(auth(user))
      .send({ targetListId: list.id, beforeCardId: top.id, afterCardId: bottom.id })
      .expect(201);

    // The rebalance rewrote the whole scope with short evenly spaced keys.
    const order = await listOrder(app, user, boardId, list.id);
    expect(order.map((card: any) => card.title)).toEqual(['Top', 'Dropping', 'Bottom']);
    for (const card of order) {
      expect(card.position.length).toBeLessThanOrEqual(50);
    }
    expect(response.body.card.position.length).toBeLessThanOrEqual(50);
  });

  it('serializes two concurrent moves into the same gap', async () => {
    const user = await registerUser(app, 'Racer');
    const { boardId } = await seedBoard(app, user, 'Race');
    const list = await createList(app, user, boardId, 'Contended');

    const top = await createCard(app, user, list.id, 'Top');
    const bottom = await createCard(app, user, list.id, 'Bottom');
    const racerA = await createCard(app, user, list.id, 'Racer A');
    const racerB = await createCard(app, user, list.id, 'Racer B');

    const [first, second] = await Promise.all([
      api(app)
        .post(`/api/cards/${racerA.id}/move`)
        .set(auth(user))
        .send({ targetListId: list.id, beforeCardId: top.id, afterCardId: bottom.id }),
      api(app)
        .post(`/api/cards/${racerB.id}/move`)
        .set(auth(user))
        .send({ targetListId: list.id, beforeCardId: top.id, afterCardId: bottom.id }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const positionA = first.body.card.position;
    const positionB = second.body.card.position;
    expect(positionA).not.toBe(positionB);

    const order = await listOrder(app, user, boardId, list.id);
    const titles = order.map((card: any) => card.title);
    expect(titles[0]).toBe('Top');
    expect(titles[titles.length - 1]).toBe('Bottom');
    expect(titles.slice(1, 3).sort()).toEqual(['Racer A', 'Racer B']);

    const positions = order.map((card: any) => card.position);
    expect([...positions].sort()).toEqual(positions);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('reorders lists with neighbour ids and keeps board order', async () => {
    const user = await registerUser(app, 'List Mover');
    const { boardId } = await seedBoard(app, user, 'List Order');
    const a = await createList(app, user, boardId, 'A');
    const b = await createList(app, user, boardId, 'B');
    const c = await createList(app, user, boardId, 'C');

    await api(app)
      .post(`/api/lists/${c.id}/move`)
      .set(auth(user))
      .send({ beforeListId: a.id, afterListId: b.id })
      .expect(201);

    const response = await api(app).get(`/api/boards/${boardId}`).set(auth(user)).expect(200);
    expect(response.body.lists.map((list: any) => list.title)).toEqual(['A', 'C', 'B']);
  });

  it('rejects a move into a list on another board', async () => {
    const user = await registerUser(app, 'Cross Board');
    const { boardId: boardOne } = await seedBoard(app, user, 'Board One');
    const { boardId: boardTwo } = await seedBoard(app, user, 'Board Two');
    const listOne = await createList(app, user, boardOne, 'One');
    const listTwo = await createList(app, user, boardTwo, 'Two');
    const card = await createCard(app, user, listOne.id, 'Wanderer');

    const response = await api(app)
      .post(`/api/cards/${card.id}/move`)
      .set(auth(user))
      .send({ targetListId: listTwo.id, beforeCardId: null, afterCardId: null })
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

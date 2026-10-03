import { INestApplication } from '@nestjs/common';
import { WS_EVENTS, needsRebalance, positionBetween } from '@trello-clone/shared';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';
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

/** Resolves with the next payload for an event, or rejects on timeout. */
function nextEvent<T = any>(socket: Socket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

describe('realtime gateway and presence (phase 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const adapter = new RedisIoAdapter(app);
    adapter.connect();
    app.useWebSocketAdapter(adapter);
    await app.listen(0);
    const address = app.getHttpServer().address();
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await closeApp(app);
  });

  async function connect(user: TestUser): Promise<Socket> {
    const socket = io(url, { auth: { token: user.token }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return socket;
  }

  async function openBoard(socket: Socket, boardId: string) {
    const presence = nextEvent(socket, WS_EVENTS.PRESENCE_UPDATED);
    socket.emit(WS_EVENTS.BOARD_OPEN, { boardId });
    return presence;
  }

  it('rejects a socket with no access token', async () => {
    const socket = io(url, { transports: ['websocket'] });
    sockets.push(socket);
    const error = await nextEvent(socket, WS_EVENTS.ERROR);
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('shows both viewers in board presence', async () => {
    const owner = await registerUser(app, 'Presence Owner');
    const mate = await registerUser(app, 'Presence Mate');
    const { boardId } = await seedBoard(app, owner, 'Presence Board');
    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: mate.id, role: 'member' })
      .expect(201);

    const socketA = await connect(owner);
    await openBoard(socketA, boardId);

    const socketB = await connect(mate);
    const presenceOnA = nextEvent(socketB, WS_EVENTS.PRESENCE_UPDATED);
    socketB.emit(WS_EVENTS.BOARD_OPEN, { boardId });
    const presence = await presenceOnA;

    expect(presence.boardId).toBe(boardId);
    const ids = presence.viewers.map((v: any) => v.userId).sort();
    expect(ids).toEqual([owner.id, mate.id].sort());
  });

  it('broadcasts an authoritative card:moved to the other client', async () => {
    const owner = await registerUser(app, 'Move Owner');
    const mate = await registerUser(app, 'Move Watcher');
    const { boardId } = await seedBoard(app, owner, 'Move Board');
    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: mate.id, role: 'member' })
      .expect(201);

    const list = await createList(app, owner, boardId, 'Tasks');
    const top = await createCard(app, owner, list.id, 'Top');
    const bottom = await createCard(app, owner, list.id, 'Bottom');
    const mover = await createCard(app, owner, list.id, 'Mover');

    const socketA = await connect(owner);
    const socketB = await connect(mate);
    await openBoard(socketA, boardId);
    await openBoard(socketB, boardId);

    const movedOnB = nextEvent(socketB, WS_EVENTS.CARD_MOVED);
    const activityOnB = nextEvent(socketB, WS_EVENTS.ACTIVITY_NEW);

    socketA.emit(WS_EVENTS.CARD_MOVE, {
      cardId: mover.id,
      targetListId: list.id,
      beforeCardId: top.id,
      afterCardId: bottom.id,
    });

    const moved = await movedOnB;
    expect(moved.cardId).toBe(mover.id);
    expect(moved.listId).toBe(list.id);
    expect(moved.position > top.position).toBe(true);
    expect(moved.position < bottom.position).toBe(true);

    const activity = await activityOnB;
    expect(activity.activity.type).toBe('card.moved');

    // The websocket path and the REST path share one write path.
    const bootstrap = await api(app).get(`/api/boards/${boardId}`).set(auth(owner)).expect(200);
    const stored = bootstrap.body.cards.find((c: any) => c.id === mover.id);
    expect(stored.position).toBe(moved.position);
  });

  it('broadcasts list:reordered after a rebalance', async () => {
    const owner = await registerUser(app, 'Rebalance Owner');
    const { boardId } = await seedBoard(app, owner, 'Rebalance Board');
    const list = await createList(app, owner, boardId, 'Tight');
    const top = await createCard(app, owner, list.id, 'Top');
    const bottom = await createCard(app, owner, list.id, 'Bottom');
    const dropping = await createCard(app, owner, list.id, 'Dropping');

    const low = 'a0';
    let high = 'a1';
    let between = positionBetween(low, high);
    while (!needsRebalance(between)) {
      high = between;
      between = positionBetween(low, high);
    }
    await prisma.card.update({ where: { id: dropping.id }, data: { position: 'a2' } });
    await prisma.card.update({ where: { id: top.id }, data: { position: low } });
    await prisma.card.update({ where: { id: bottom.id }, data: { position: high } });

    const socket = await connect(owner);
    await openBoard(socket, boardId);

    const reordered = nextEvent(socket, WS_EVENTS.LIST_REORDERED);
    socket.emit(WS_EVENTS.CARD_MOVE, {
      cardId: dropping.id,
      targetListId: list.id,
      beforeCardId: top.id,
      afterCardId: bottom.id,
    });

    const payload = await reordered;
    expect(payload.listId).toBe(list.id);
    expect(payload.orderedCardIds).toEqual([top.id, dropping.id, bottom.id]);
  });

  it('broadcasts board:lists_reordered after a list rebalance', async () => {
    const owner = await registerUser(app, 'List Rebalancer');
    const { boardId } = await seedBoard(app, owner, 'List Rebalance');
    const first = await createList(app, owner, boardId, 'First');
    const last = await createList(app, owner, boardId, 'Last');
    const mover = await createList(app, owner, boardId, 'Mover');

    const low = 'a0';
    let high = 'a1';
    let between = positionBetween(low, high);
    while (!needsRebalance(between)) {
      high = between;
      between = positionBetween(low, high);
    }
    await prisma.list.update({ where: { id: mover.id }, data: { position: 'a2' } });
    await prisma.list.update({ where: { id: first.id }, data: { position: low } });
    await prisma.list.update({ where: { id: last.id }, data: { position: high } });

    const socket = await connect(owner);
    await openBoard(socket, boardId);

    const reordered = nextEvent(socket, WS_EVENTS.BOARD_LISTS_REORDERED);
    socket.emit(WS_EVENTS.LIST_MOVE, {
      listId: mover.id,
      beforeListId: first.id,
      afterListId: last.id,
    });

    const payload = await reordered;
    expect(payload.orderedListIds).toEqual([first.id, mover.id, last.id]);
  });

  it('broadcasts a card update from the socket path', async () => {
    const owner = await registerUser(app, 'Update Owner');
    const mate = await registerUser(app, 'Update Watcher');
    const { boardId } = await seedBoard(app, owner, 'Update Board');
    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: mate.id, role: 'member' })
      .expect(201);
    const list = await createList(app, owner, boardId, 'Tasks');
    const card = await createCard(app, owner, list.id, 'Before');

    const socketA = await connect(owner);
    const socketB = await connect(mate);
    await openBoard(socketA, boardId);
    await openBoard(socketB, boardId);

    const updated = nextEvent(socketB, WS_EVENTS.CARD_UPDATED);
    socketA.emit(WS_EVENTS.CARD_UPDATE, { cardId: card.id, patch: { title: 'After' } });

    const payload = await updated;
    expect(payload.card.id).toBe(card.id);
    expect(payload.card.title).toBe('After');
  });

  it('refuses a board open the caller cannot view', async () => {
    const owner = await registerUser(app, 'Guarded Owner');
    const stranger = await registerUser(app, 'Guarded Stranger');
    const { boardId } = await seedBoard(app, owner, 'Guarded');
    await api(app)
      .patch(`/api/boards/${boardId}`)
      .set(auth(owner))
      .send({ visibility: 'private' })
      .expect(200);

    const socket = await connect(stranger);
    const error = nextEvent(socket, WS_EVENTS.ERROR);
    socket.emit(WS_EVENTS.BOARD_OPEN, { boardId });
    expect((await error).code).toBe('FORBIDDEN');
  });

  it('delivers a mention notification to the mentioned user room', async () => {
    const author = await registerUser(app, 'Socket Author');
    const target = await registerUser(app, 'Alan Turing');
    const { boardId } = await seedBoard(app, author, 'Socket Mentions');
    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(author))
      .send({ userId: target.id, role: 'member' })
      .expect(201);
    const list = await createList(app, author, boardId, 'Tasks');
    const card = await createCard(app, author, list.id, 'Mention card');

    const socket = await connect(target);
    const notification = nextEvent(socket, WS_EVENTS.NOTIFICATION_NEW);

    await api(app)
      .post(`/api/cards/${card.id}/comments`)
      .set(auth(author))
      .send({ text: 'thoughts @Alan Turing ?' })
      .expect(201);

    const payload = await notification;
    expect(payload.notification.type).toBe('mention');
    expect(payload.notification.userId).toBe(target.id);
  });
});

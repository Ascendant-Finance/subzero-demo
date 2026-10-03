import { INestApplication } from '@nestjs/common';
import { DEFAULT_LABELS } from '@trello-clone/shared';
import { api, auth, closeApp, createCard, createList, createTestApp, registerUser, seedBoard } from './helpers';

describe('workspaces and boards (phase 4)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  it('creates a workspace with the creator as admin', async () => {
    const user = await registerUser(app, 'WS Admin');
    const created = await api(app)
      .post('/api/workspaces')
      .set(auth(user))
      .send({ name: 'Acme Inc' })
      .expect(201);

    expect(created.body.workspace.name).toBe('Acme Inc');
    expect(created.body.workspace.slug).toMatch(/^acme-inc/);

    const detail = await api(app)
      .get(`/api/workspaces/${created.body.workspace.id}`)
      .set(auth(user))
      .expect(200);
    expect(detail.body.members).toHaveLength(1);
    expect(detail.body.members[0].role).toBe('admin');
  });

  it('seeds the six default labels on a new board', async () => {
    const user = await registerUser(app, 'Label Owner');
    const { boardId } = await seedBoard(app, user, 'Labelled');

    const bootstrap = await api(app).get(`/api/boards/${boardId}`).set(auth(user)).expect(200);
    expect(bootstrap.body.labels).toHaveLength(6);
    expect(bootstrap.body.labels.map((l: any) => l.color).sort()).toEqual(
      DEFAULT_LABELS.map((l) => l.color).sort(),
    );
  });

  it('returns the full bootstrap payload shape with ordered lists and cards', async () => {
    const user = await registerUser(app, 'Bootstrap Owner');
    const { boardId } = await seedBoard(app, user, 'Roadmap');

    const todo = await createList(app, user, boardId, 'To Do');
    const doing = await createList(app, user, boardId, 'Doing');
    await createCard(app, user, todo.id, 'First');
    await createCard(app, user, todo.id, 'Second');
    await createCard(app, user, doing.id, 'Third');

    const response = await api(app).get(`/api/boards/${boardId}`).set(auth(user)).expect(200);
    const body = response.body;

    expect(Object.keys(body).sort()).toEqual(['board', 'cards', 'labels', 'lists', 'members']);
    expect(body.board.id).toBe(boardId);
    expect(body.members).toHaveLength(1);
    expect(body.lists.map((l: any) => l.title)).toEqual(['To Do', 'Doing']);

    const positions = body.lists.map((l: any) => l.position);
    expect([...positions].sort()).toEqual(positions);

    const todoCards = body.cards
      .filter((c: any) => c.listId === todo.id)
      .map((c: any) => c.title);
    expect(todoCards).toEqual(['First', 'Second']);
    expect(body.cards[0]).toHaveProperty('labelIds');
    expect(body.cards[0]).toHaveProperty('checklistTotal');
  });

  it('enforces visibility rules across two users', async () => {
    const owner = await registerUser(app, 'Visibility Owner');
    const outsider = await registerUser(app, 'Outsider');
    const { workspaceId, boardId } = await seedBoard(app, owner, 'Visible Board');

    // A workspace board is out of reach for someone outside the workspace.
    await api(app).get(`/api/boards/${boardId}`).set(auth(outsider)).expect(403);

    // Once in the workspace, a workspace board becomes readable but not editable.
    const invite = await api(app)
      .post(`/api/workspaces/${workspaceId}/invites`)
      .set(auth(owner))
      .send({ role: 'member' })
      .expect(201);
    await api(app)
      .post('/api/workspaces/join')
      .set(auth(outsider))
      .send({ code: invite.body.invite.code })
      .expect(201);

    await api(app).get(`/api/boards/${boardId}`).set(auth(outsider)).expect(200);
    await api(app)
      .post(`/api/boards/${boardId}/lists`)
      .set(auth(outsider))
      .send({ title: 'Sneaky list' })
      .expect(403);

    // A public board is readable by any authenticated user, still not editable.
    const stranger = await registerUser(app, 'Public Reader');
    await api(app)
      .patch(`/api/boards/${boardId}`)
      .set(auth(owner))
      .send({ visibility: 'public' })
      .expect(200);
    await api(app).get(`/api/boards/${boardId}`).set(auth(stranger)).expect(200);
    await api(app)
      .post(`/api/boards/${boardId}/lists`)
      .set(auth(stranger))
      .send({ title: 'Nope' })
      .expect(403);
  });

  it('applies board roles: member edits, observer only comments', async () => {
    const owner = await registerUser(app, 'Role Owner');
    const member = await registerUser(app, 'Role Member');
    const observer = await registerUser(app, 'Role Observer');
    const { boardId } = await seedBoard(app, owner, 'Roles');
    const list = await createList(app, owner, boardId, 'Tasks');
    const card = await createCard(app, owner, list.id, 'Task one');

    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: member.id, role: 'member' })
      .expect(201);
    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: observer.id, role: 'observer' })
      .expect(201);

    await api(app)
      .post(`/api/lists/${list.id}/cards`)
      .set(auth(member))
      .send({ title: 'Member card' })
      .expect(201);

    await api(app)
      .post(`/api/lists/${list.id}/cards`)
      .set(auth(observer))
      .send({ title: 'Observer card' })
      .expect(403);

    // Open decision 2 default: an observer may still comment.
    await api(app)
      .post(`/api/cards/${card.id}/comments`)
      .set(auth(observer))
      .send({ text: 'Looks good' })
      .expect(201);
  });

  it('stars, closes and reopens a board', async () => {
    const user = await registerUser(app, 'Star Owner');
    const { boardId } = await seedBoard(app, user, 'Starred');

    const starred = await api(app).post(`/api/boards/${boardId}/star`).set(auth(user)).expect(201);
    expect(starred.body).toEqual({ starred: true });

    const bootstrap = await api(app).get(`/api/boards/${boardId}`).set(auth(user)).expect(200);
    expect(bootstrap.body.board.starred).toBe(true);

    await api(app).delete(`/api/boards/${boardId}/star`).set(auth(user)).expect(200);

    const closed = await api(app).post(`/api/boards/${boardId}/close`).set(auth(user)).expect(201);
    expect(closed.body.board.closed).toBe(true);

    // A closed board rejects edits until it is reopened.
    await api(app)
      .post(`/api/boards/${boardId}/lists`)
      .set(auth(user))
      .send({ title: 'After close' })
      .expect(403);

    await api(app).post(`/api/boards/${boardId}/reopen`).set(auth(user)).expect(201);
    await api(app)
      .post(`/api/boards/${boardId}/lists`)
      .set(auth(user))
      .send({ title: 'After reopen' })
      .expect(201);
  });

  it('refuses to demote the last board admin', async () => {
    const owner = await registerUser(app, 'Only Admin');
    const { boardId } = await seedBoard(app, owner, 'Solo Admin');

    const response = await api(app)
      .patch(`/api/boards/${boardId}/members/${owner.id}`)
      .set(auth(owner))
      .send({ role: 'member' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });
});

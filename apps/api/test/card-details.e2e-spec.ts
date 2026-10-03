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

describe('card details (phase 6)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  it('adds a label and a member to a card', async () => {
    const owner = await registerUser(app, 'Detail Owner');
    const mate = await registerUser(app, 'Detail Mate');
    const { boardId } = await seedBoard(app, owner, 'Details');
    const list = await createList(app, owner, boardId, 'Tasks');
    const card = await createCard(app, owner, list.id, 'Detailed card');

    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: mate.id, role: 'member' })
      .expect(201);

    const bootstrap = await api(app).get(`/api/boards/${boardId}`).set(auth(owner)).expect(200);
    const label = bootstrap.body.labels[0];

    await api(app)
      .post(`/api/cards/${card.id}/labels`)
      .set(auth(owner))
      .send({ labelId: label.id })
      .expect(201);
    await api(app)
      .post(`/api/cards/${card.id}/members`)
      .set(auth(owner))
      .send({ userId: mate.id })
      .expect(201);

    const detail = await api(app).get(`/api/cards/${card.id}`).set(auth(owner)).expect(200);
    expect(detail.body.labels.map((l: any) => l.id)).toEqual([label.id]);
    expect(detail.body.members.map((m: any) => m.id)).toEqual([mate.id]);
    expect(detail.body.card.labelIds).toEqual([label.id]);

    await api(app)
      .delete(`/api/cards/${card.id}/labels/${label.id}`)
      .set(auth(owner))
      .expect(200);
    const after = await api(app).get(`/api/cards/${card.id}`).set(auth(owner)).expect(200);
    expect(after.body.labels).toHaveLength(0);
  });

  it('notifies a user assigned to a card', async () => {
    const owner = await registerUser(app, 'Assigner');
    const assignee = await registerUser(app, 'Assignee');
    const { boardId } = await seedBoard(app, owner, 'Assigning');
    const list = await createList(app, owner, boardId, 'Tasks');
    const card = await createCard(app, owner, list.id, 'Assign me');

    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(owner))
      .send({ userId: assignee.id, role: 'member' })
      .expect(201);
    await api(app)
      .post(`/api/cards/${card.id}/members`)
      .set(auth(owner))
      .send({ userId: assignee.id })
      .expect(201);

    const notifications = await api(app)
      .get('/api/notifications')
      .set(auth(assignee))
      .expect(200);
    const types = notifications.body.notifications.map((n: any) => n.type);
    expect(types).toContain('assigned');
  });

  it('creates a checklist with items and tracks progress', async () => {
    const user = await registerUser(app, 'Checklist Owner');
    const { boardId } = await seedBoard(app, user, 'Checklists');
    const list = await createList(app, user, boardId, 'Tasks');
    const card = await createCard(app, user, list.id, 'With checklist');

    const checklist = await api(app)
      .post(`/api/cards/${card.id}/checklists`)
      .set(auth(user))
      .send({ title: 'Steps' })
      .expect(201);

    const items: any[] = [];
    for (const text of ['One', 'Two', 'Three']) {
      const item = await api(app)
        .post(`/api/checklists/${checklist.body.checklist.id}/items`)
        .set(auth(user))
        .send({ text })
        .expect(201);
      items.push(item.body.item);
    }
    expect(items.map((i) => i.position).sort()).toEqual(items.map((i) => i.position));

    await api(app)
      .patch(`/api/checklist-items/${items[0].id}`)
      .set(auth(user))
      .send({ completed: true })
      .expect(200);

    const detail = await api(app).get(`/api/cards/${card.id}`).set(auth(user)).expect(200);
    expect(detail.body.checklists[0].items).toHaveLength(3);
    expect(detail.body.card.checklistTotal).toBe(3);
    expect(detail.body.card.checklistDone).toBe(1);
  });

  it('posts a comment with a mention and notifies the mentioned user', async () => {
    const author = await registerUser(app, 'Comment Author');
    const mentioned = await registerUser(app, 'Grace Hopper');
    const { boardId } = await seedBoard(app, author, 'Mentions');
    const list = await createList(app, author, boardId, 'Tasks');
    const card = await createCard(app, author, list.id, 'Discuss this');

    await api(app)
      .post(`/api/boards/${boardId}/members`)
      .set(auth(author))
      .send({ userId: mentioned.id, role: 'member' })
      .expect(201);

    await api(app)
      .post(`/api/cards/${card.id}/comments`)
      .set(auth(author))
      .send({ text: 'Handing this to @Grace Hopper for review' })
      .expect(201);

    const notifications = await api(app)
      .get('/api/notifications')
      .set(auth(mentioned))
      .expect(200);
    const mention = notifications.body.notifications.find((n: any) => n.type === 'mention');
    expect(mention).toBeDefined();
    expect(mention.cardId).toBe(card.id);
    expect(mention.read).toBe(false);

    await api(app).post(`/api/notifications/${mention.id}/read`).set(auth(mentioned)).expect(201);
    const after = await api(app).get('/api/notifications').set(auth(mentioned)).expect(200);
    expect(after.body.notifications.find((n: any) => n.id === mention.id).read).toBe(true);
  });

  it('does not notify an author who mentions themselves', async () => {
    const author = await registerUser(app, 'Solo Talker');
    const { boardId } = await seedBoard(app, author, 'Solo');
    const list = await createList(app, author, boardId, 'Tasks');
    const card = await createCard(app, author, list.id, 'Talking to myself');

    await api(app)
      .post(`/api/cards/${card.id}/comments`)
      .set(auth(author))
      .send({ text: `noting for @${author.name}` })
      .expect(201);

    const notifications = await api(app).get('/api/notifications').set(auth(author)).expect(200);
    expect(notifications.body.notifications.filter((n: any) => n.type === 'mention')).toHaveLength(0);
  });

  it('presigns an upload and links the attachment as the card cover', async () => {
    const user = await registerUser(app, 'Uploader');
    const { boardId } = await seedBoard(app, user, 'Attachments');
    const list = await createList(app, user, boardId, 'Tasks');
    const card = await createCard(app, user, list.id, 'With cover');

    const presign = await api(app)
      .post(`/api/uploads/presign?cardId=${card.id}`)
      .set(auth(user))
      .send({ fileName: 'diagram.png', mimeType: 'image/png', sizeBytes: 2048 })
      .expect(201);

    expect(presign.body.uploadUrl).toContain('https://');
    expect(presign.body.publicUrl).toContain(presign.body.attachmentId);

    const attachment = await api(app)
      .post(`/api/cards/${card.id}/attachments`)
      .set(auth(user))
      .send({
        kind: 'file',
        url: presign.body.publicUrl,
        name: 'diagram.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
        attachmentId: presign.body.attachmentId,
      })
      .expect(201);

    const covered = await api(app)
      .post(`/api/cards/${card.id}/attachments/${attachment.body.attachment.id}/cover`)
      .set(auth(user))
      .expect(201);

    expect(covered.body.card.coverType).toBe('image');
    expect(covered.body.card.coverValue).toBe(presign.body.publicUrl);
  });

  it('refuses an upload over the size cap with UPLOAD_TOO_LARGE', async () => {
    const user = await registerUser(app, 'Big Uploader');
    const { boardId } = await seedBoard(app, user, 'Too Big');
    const list = await createList(app, user, boardId, 'Tasks');
    const card = await createCard(app, user, list.id, 'Huge');

    const response = await api(app)
      .post(`/api/uploads/presign?cardId=${card.id}`)
      .set(auth(user))
      .send({ fileName: 'huge.zip', mimeType: 'application/zip', sizeBytes: 26214401 })
      .expect(413);
    expect(response.body.error.code).toBe('UPLOAD_TOO_LARGE');
  });

  it('edits a card title, description and due state', async () => {
    const user = await registerUser(app, 'Editor');
    const { boardId } = await seedBoard(app, user, 'Editing');
    const list = await createList(app, user, boardId, 'Tasks');
    const card = await createCard(app, user, list.id, 'Rough draft');

    const due = new Date(Date.now() + 86400000).toISOString();
    const updated = await api(app)
      .patch(`/api/cards/${card.id}`)
      .set(auth(user))
      .send({ title: 'Polished', description: '# Heading\n\nSome **markdown**', dueAt: due })
      .expect(200);

    expect(updated.body.card.title).toBe('Polished');
    expect(updated.body.card.description).toContain('markdown');
    expect(updated.body.card.dueAt).toBe(due);

    const complete = await api(app)
      .patch(`/api/cards/${card.id}`)
      .set(auth(user))
      .send({ dueComplete: true })
      .expect(200);
    expect(complete.body.card.dueComplete).toBe(true);

    const archived = await api(app)
      .patch(`/api/cards/${card.id}`)
      .set(auth(user))
      .send({ archived: true })
      .expect(200);
    expect(archived.body.card.archived).toBe(true);

    // An archived card drops out of the board bootstrap payload.
    const bootstrap = await api(app).get(`/api/boards/${boardId}`).set(auth(user)).expect(200);
    expect(bootstrap.body.cards.find((c: any) => c.id === card.id)).toBeUndefined();
  });
});

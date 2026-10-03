import { INestApplication } from '@nestjs/common';
import { api, auth, closeApp, createTestApp, registerUser, seedBoard, uniqueEmail } from './helpers';

describe('auth and permissions (phase 3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  it('registers, returns an access token and sets a refresh cookie', async () => {
    const email = uniqueEmail('register');
    const response = await api(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'New Person' })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    expect(typeof response.body.accessToken).toBe('string');
    expect(String(response.headers['set-cookie'])).toContain('refresh_token=');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const email = uniqueEmail('dupe');
    await api(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'First' })
      .expect(201);

    const response = await api(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'Second' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a short password with VALIDATION_FAILED', async () => {
    const response = await api(app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail('short'), password: 'tiny', name: 'Tiny' })
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('logs in and rejects a wrong password with UNAUTHENTICATED', async () => {
    const user = await registerUser(app, 'Login Person');

    const ok = await api(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' })
      .expect(201);
    expect(ok.body.user.id).toBe(user.id);

    const bad = await api(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rotates the refresh token and refuses the consumed one', async () => {
    const user = await registerUser(app, 'Refresh Person');

    const first = await api(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(201);
    expect(typeof first.body.accessToken).toBe('string');

    // The original cookie has now been consumed and must not work again.
    const replay = await api(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
    expect(replay.body.error.code).toBe('UNAUTHENTICATED');

    const rotated = String(first.headers['set-cookie']);
    await api(app).post('/api/auth/refresh').set('Cookie', rotated).expect(201);
  });

  it('logs out and revokes the refresh token', async () => {
    const user = await registerUser(app, 'Logout Person');
    await api(app).post('/api/auth/logout').set('Cookie', user.cookie).expect(201);
    await api(app).post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
  });

  it('serves /auth/me and rejects a missing or bad token', async () => {
    const user = await registerUser(app, 'Me Person');

    const me = await api(app).get('/api/auth/me').set(auth(user)).expect(200);
    expect(me.body.user.id).toBe(user.id);

    const missing = await api(app).get('/api/auth/me').expect(401);
    expect(missing.body.error.code).toBe('UNAUTHENTICATED');

    const bad = await api(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a non member from a private board with FORBIDDEN', async () => {
    const owner = await registerUser(app, 'Board Owner');
    const stranger = await registerUser(app, 'Stranger');
    const { boardId } = await seedBoard(app, owner, 'Private Board');

    await api(app)
      .patch(`/api/boards/${boardId}`)
      .set(auth(owner))
      .send({ visibility: 'private' })
      .expect(200);

    const response = await api(app).get(`/api/boards/${boardId}`).set(auth(stranger)).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND for a board that does not exist', async () => {
    const user = await registerUser(app, 'Ghost Hunter');
    const response = await api(app)
      .get('/api/boards/does-not-exist')
      .set(auth(user))
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

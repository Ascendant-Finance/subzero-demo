import './setup';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
  cookie: string;
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export const api = (app: INestApplication) => request(app.getHttpServer());

export function uniqueEmail(prefix = 'user') {
  return `${prefix}.${randomBytes(6).toString('hex')}@example.com`;
}

export async function registerUser(
  app: INestApplication,
  name = 'Test User',
): Promise<TestUser> {
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, ''));
  const response = await api(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name })
    .expect(201);

  const rawCookie = response.headers['set-cookie'];
  const cookie = Array.isArray(rawCookie) ? rawCookie.join('; ') : String(rawCookie ?? '');

  return {
    id: response.body.user.id,
    email,
    name,
    token: response.body.accessToken,
    cookie,
  };
}

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

/** Registers a user, a workspace and a board, and returns the ids. */
export async function seedBoard(app: INestApplication, user: TestUser, title = 'Board') {
  const workspace = await api(app)
    .post('/api/workspaces')
    .set(auth(user))
    .send({ name: `WS ${randomBytes(3).toString('hex')}` })
    .expect(201);

  const board = await api(app)
    .post(`/api/workspaces/${workspace.body.workspace.id}/boards`)
    .set(auth(user))
    .send({ title })
    .expect(201);

  return { workspaceId: workspace.body.workspace.id, boardId: board.body.board.id };
}

export async function createList(app: INestApplication, user: TestUser, boardId: string, title: string) {
  const response = await api(app)
    .post(`/api/boards/${boardId}/lists`)
    .set(auth(user))
    .send({ title })
    .expect(201);
  return response.body.list;
}

export async function createCard(app: INestApplication, user: TestUser, listId: string, title: string) {
  const response = await api(app)
    .post(`/api/lists/${listId}/cards`)
    .set(auth(user))
    .send({ title })
    .expect(201);
  return response.body.card;
}

export async function closeApp(app: INestApplication) {
  const prisma = app.get(PrismaService);
  await prisma.$disconnect().catch(() => undefined);
  await app.close();
}

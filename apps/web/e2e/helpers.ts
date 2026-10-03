import type { Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api';

export function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Registers a user straight against the API, then signs them in the browser. */
export async function signUp(page: Page, name: string) {
  const email = `${unique('pw')}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL('/');
  return { email, name };
}

export async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/');
}

/** Creates a workspace and a board through the dashboard UI. */
export async function createBoard(page: Page, boardTitle: string) {
  await page.getByPlaceholder('Workspace name').fill(unique('ws'));
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();

  await page.getByRole('button', { name: 'Create board' }).click();
  await page.getByPlaceholder('Board title').fill(boardTitle);
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();

  const tile = page.getByRole('link', { name: boardTitle });
  await tile.waitFor();
  await tile.click();
  await page.waitForURL(/\/boards\//);
  return page.url().split('/boards/')[1].split('?')[0];
}

export async function addList(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add another list' }).click();
  await page.getByPlaceholder('Enter list title').fill(title);
  await page.getByRole('button', { name: 'Add list' }).click();
  await listColumn(page, title).waitFor();
}

export function listColumn(page: Page, listTitle: string) {
  return page.locator(`[data-testid="list"][data-list-title="${listTitle}"]`);
}

export function cardTile(page: Page, cardTitle: string) {
  return page.locator(`[data-testid="card"][data-card-title="${cardTitle}"]`);
}

export async function addCard(page: Page, listTitle: string, cardTitle: string) {
  const column = listColumn(page, listTitle);
  const composer = column.getByPlaceholder('Enter a title for this card');

  // The composer stays open after each add so several cards can be typed in a
  // row, so only open it when it is not already showing.
  if (!(await composer.isVisible().catch(() => false))) {
    await column.getByRole('button', { name: 'Add a card' }).click();
  }
  await composer.fill(cardTitle);
  await column.getByRole('button', { name: 'Add card' }).click();
  await cardTile(page, cardTitle).waitFor();
  await composer.press('Escape').catch(() => undefined);
}

/** Pointer driven drag, which is what dnd-kit's PointerSensor listens for. */
export async function dragCardTo(page: Page, cardTitle: string, targetCardTitle: string) {
  const source = cardTile(page, cardTitle);
  const target = cardTile(page, targetCardTitle);

  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // dnd-kit needs movement past its 4px activation distance, then a settle.
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4, { steps: 5 });
  await page.mouse.up();
}

/** Card titles in a list column, top to bottom. */
export async function cardOrder(page: Page, listTitle: string) {
  return listColumn(page, listTitle).locator('[data-testid="card-title"]').allInnerTexts();
}

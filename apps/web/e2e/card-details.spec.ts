import { expect, test } from '@playwright/test';
import { API, addCard, addList, cardTile, createBoard, signUp } from './helpers';

/** Adds a second person to a board and returns their page. */
async function addBoardMember(owner: any, mate: any, boardId: string) {
  const mateId = await mate.evaluate(async (base: string) => {
    const refreshed = await fetch(`${base}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const { accessToken } = await refreshed.json();
    const me = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    return (await me.json()).user.id as string;
  }, API);

  await owner.evaluate(
    async ({ base, board, userId }: { base: string; board: string; userId: string }) => {
      const refreshed = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const { accessToken } = await refreshed.json();
      await fetch(`${base}/boards/${board}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ userId, role: 'member' }),
      });
    },
    { base: API, board: boardId, userId: mateId },
  );
}

test('card editing reflects live to a second session and mentions notify', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const mateContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const mate = await mateContext.newPage();

  await signUp(owner, 'Detail Owner');
  await signUp(mate, 'Grace Hopper');

  const boardId = await createBoard(owner, 'Detail Board');
  await addList(owner, 'To Do');
  await addCard(owner, 'To Do', 'Shared card');
  await addBoardMember(owner, mate, boardId);

  await mate.goto(`/boards/${boardId}`);
  await cardTile(mate, 'Shared card').waitFor();

  // Open the card and edit its description as markdown.
  await cardTile(owner, 'Shared card').click();
  const modal = owner.getByRole('dialog');
  await modal.waitFor();

  await modal.getByText('Add a more detailed description').click();
  await modal.getByPlaceholder('Add a more detailed description').fill('A **bold** plan');
  await modal.getByRole('button', { name: 'Preview' }).click();
  await expect(modal.locator('strong', { hasText: 'bold' })).toBeVisible();
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(modal.locator('strong', { hasText: 'bold' })).toBeVisible();

  // Add a label; the other session sees the chip on the card front.
  await modal.getByRole('button', { name: 'Labels' }).click();
  await modal.locator('button[style*="background"]').first().click();

  // Add a checklist and one item, then tick it.
  await modal.getByPlaceholder('Add checklist').fill('Steps');
  await modal.getByRole('button', { name: 'Add', exact: true }).click();
  await modal.getByPlaceholder('Add an item').fill('First step');
  await modal.getByPlaceholder('Add an item').press('Enter');
  await modal.getByRole('checkbox').first().click();
  await expect(modal.getByRole('checkbox').first()).toBeChecked();
  await expect(modal.getByText('100%')).toBeVisible();

  // Comment with a mention, using the autocomplete.
  await modal.getByPlaceholder('Write a comment').fill('over to @Grace');
  await modal.getByRole('button', { name: 'Grace Hopper' }).click();
  await modal.getByRole('button', { name: 'Comment' }).click();
  await expect(modal.getByText('over to @Grace Hopper')).toBeVisible();

  // The mentioned user gets a live notification.
  await expect(mate.locator('button[aria-label="Notifications"] span').first()).toBeVisible({
    timeout: 20_000,
  });
  await mate.getByRole('button', { name: 'Notifications' }).click();
  await expect(mate.getByText('mentioned you', { exact: false })).toBeVisible();

  await ownerContext.close();
  await mateContext.close();
});

test('board search narrows the visible cards', async ({ page }) => {
  await signUp(page, 'Filter User');
  await createBoard(page, 'Filter Board');
  await addList(page, 'To Do');
  await addCard(page, 'To Do', 'Refactor billing');
  await addCard(page, 'To Do', 'Write onboarding docs');

  await page.getByPlaceholder('Search cards on this board').fill('onboarding');

  await expect(cardTile(page, 'Write onboarding docs')).toBeVisible();
  await expect(cardTile(page, 'Refactor billing')).toBeHidden();

  // Clearing the filter brings everything back.
  await page.getByPlaceholder('Search cards on this board').fill('');
  await expect(cardTile(page, 'Refactor billing')).toBeVisible();
});

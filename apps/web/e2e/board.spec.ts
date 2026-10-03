import { expect, test } from '@playwright/test';
import { addCard, addList, cardOrder, cardTile, createBoard, dragCardTo, signUp } from './helpers';

test.describe('board drag and drop', () => {
  test('reorders cards within a list and keeps the order after reload', async ({ page }) => {
    await signUp(page, 'Drag User');
    await createBoard(page, 'Drag Board');
    await addList(page, 'To Do');
    await addCard(page, 'To Do', 'Alpha');
    await addCard(page, 'To Do', 'Beta');
    await addCard(page, 'To Do', 'Gamma');

    expect(await cardOrder(page, 'To Do')).toEqual(['Alpha', 'Beta', 'Gamma']);

    // Drag the last card up onto the first.
    await dragCardTo(page, 'Gamma', 'Alpha');
    await expect
      .poll(async () => (await cardOrder(page, 'To Do'))[0], { timeout: 15_000 })
      .toBe('Gamma');

    // The server owns the order, so a reload must agree.
    await page.reload();
    await cardTile(page, 'Alpha').waitFor();
    expect((await cardOrder(page, 'To Do'))[0]).toBe('Gamma');
  });

  test('moves a card across lists', async ({ page }) => {
    await signUp(page, 'Cross User');
    await createBoard(page, 'Cross Board');
    await addList(page, 'Source');
    await addList(page, 'Target');
    await addCard(page, 'Source', 'Travelling card');
    await addCard(page, 'Target', 'Resident card');

    await dragCardTo(page, 'Travelling card', 'Resident card');

    await expect
      .poll(async () => await cardOrder(page, 'Target'), { timeout: 15_000 })
      .toContain('Travelling card');

    await page.reload();
    await cardTile(page, 'Resident card').waitFor();
    expect(await cardOrder(page, 'Target')).toContain('Travelling card');
    expect(await cardOrder(page, 'Source')).not.toContain('Travelling card');
  });
});

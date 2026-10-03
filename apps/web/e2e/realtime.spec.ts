import { expect, test } from '@playwright/test';
import { addCard, addList, cardOrder, cardTile, createBoard, dragCardTo, signUp } from './helpers';
import { API } from './helpers';

test.describe('two sessions on one board', () => {
  test('a drag in one session reaches the other and both stay consistent', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const mateContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const mate = await mateContext.newPage();

    await signUp(owner, 'Session Owner');
    await signUp(mate, 'Session Mate');

    const boardId = await createBoard(owner, 'Shared Board');
    await addList(owner, 'To Do');
    await addCard(owner, 'To Do', 'First');
    await addCard(owner, 'To Do', 'Second');

    // Add the second person to the board through the API, then open it there.
    const mateId = await mate.evaluate(async (base) => {
      const response = await fetch(`${base}/auth/refresh`, { method: 'POST', credentials: 'include' });
      const { accessToken } = await response.json();
      const me = await fetch(`${base}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      return (await me.json()).user.id as string;
    }, API);

    await owner.evaluate(
      async ({ base, board, userId }) => {
        const response = await fetch(`${base}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        const { accessToken } = await response.json();
        await fetch(`${base}/boards/${board}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'include',
          body: JSON.stringify({ userId, role: 'member' }),
        });
      },
      { base: API, board: boardId, userId: mateId },
    );

    await mate.goto(`/boards/${boardId}`);
    await cardTile(mate, 'First').waitFor();
    expect(await cardOrder(mate, 'To Do')).toEqual(['First', 'Second']);

    // Both sessions should now see each other in board presence.
    await expect(owner.getByText('Viewing now')).toBeVisible();

    // The owner drags; the mate must converge on the same server order.
    await dragCardTo(owner, 'Second', 'First');

    await expect
      .poll(async () => (await cardOrder(mate, 'To Do'))[0], { timeout: 20_000 })
      .toBe('Second');
    await expect
      .poll(async () => (await cardOrder(owner, 'To Do'))[0], { timeout: 20_000 })
      .toBe('Second');

    // A card created in one session appears live in the other.
    await addCard(owner, 'To Do', 'Live card');
    await expect(cardTile(mate, 'Live card')).toBeVisible();

    await ownerContext.close();
    await mateContext.close();
  });
});

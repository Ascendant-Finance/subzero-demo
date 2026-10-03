import type { BoardBootstrapResponse } from '@trello-clone/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useBoardStore } from '../board-store';

const now = new Date().toISOString();

function card(id: string, listId: string, position: string, title = id) {
  return {
    id,
    boardId: 'b1',
    listId,
    title,
    description: null,
    position,
    dueAt: null,
    dueComplete: false,
    coverType: 'none' as const,
    coverValue: null,
    archived: false,
    createdById: 'u1',
    createdAt: now,
    updatedAt: now,
    labelIds: [],
    memberIds: [],
  };
}

function list(id: string, position: string) {
  return { id, boardId: 'b1', title: id, position, archived: false, createdAt: now };
}

const bootstrap: BoardBootstrapResponse = {
  board: {
    id: 'b1',
    workspaceId: 'w1',
    title: 'Board',
    description: null,
    visibility: 'workspace',
    bgType: 'color',
    bgValue: '#1d4ed8',
    closed: false,
    createdById: 'u1',
    createdAt: now,
  },
  members: [],
  lists: [list('l1', 'a0'), list('l2', 'a1')],
  cards: [card('c1', 'l1', 'a0'), card('c2', 'l1', 'a1'), card('c3', 'l2', 'a0')],
  labels: [],
};

describe('board store', () => {
  beforeEach(() => {
    useBoardStore.getState().reset();
    useBoardStore.getState().hydrate(bootstrap);
  });

  it('hydrates lists and cards in position order', () => {
    const state = useBoardStore.getState();
    expect(state.listOrder).toEqual(['l1', 'l2']);
    expect(state.cardsByList.l1).toEqual(['c1', 'c2']);
    expect(state.cardsByList.l2).toEqual(['c3']);
  });

  it('keeps an empty list present as a drop target', () => {
    useBoardStore.getState().upsertList(list('l3', 'a2'));
    expect(useBoardStore.getState().cardsByList.l3).toEqual([]);
  });

  it('applies an authoritative move across lists', () => {
    useBoardStore.getState().applyCardMoved('c1', 'l2', 'a0V');
    const state = useBoardStore.getState();
    expect(state.cardsByList.l1).toEqual(['c2']);
    expect(state.cardsByList.l2).toEqual(['c3', 'c1']);
    expect(state.cards.c1.position).toBe('a0V');
  });

  it('moves a card optimistically before the server answers', () => {
    useBoardStore.getState().optimisticMoveCard('c3', 'l1', 'c1', 'c2');
    const state = useBoardStore.getState();
    expect(state.cardsByList.l1).toEqual(['c1', 'c3', 'c2']);
    expect(state.cards.c3.listId).toBe('l1');
    expect(state.cards.c3.position > state.cards.c1.position).toBe(true);
    expect(state.cards.c3.position < state.cards.c2.position).toBe(true);
  });

  it('corrects an optimistic guess when the server order differs', () => {
    useBoardStore.getState().optimisticMoveCard('c3', 'l1', 'c1', 'c2');
    expect(useBoardStore.getState().cardsByList.l1).toEqual(['c1', 'c3', 'c2']);

    // The server placed it last instead; the store snaps to that order.
    useBoardStore.getState().applyCardMoved('c3', 'l1', 'a2');
    expect(useBoardStore.getState().cardsByList.l1).toEqual(['c1', 'c2', 'c3']);
  });

  it('adopts the server order after a card rebalance', () => {
    useBoardStore.getState().applyListReordered('l1', ['c2', 'c1']);
    expect(useBoardStore.getState().cardsByList.l1).toEqual(['c2', 'c1']);
  });

  it('adopts the server order after a list rebalance', () => {
    useBoardStore.getState().applyListsReordered(['l2', 'l1']);
    expect(useBoardStore.getState().listOrder).toEqual(['l2', 'l1']);
  });

  it('reorders lists optimistically', () => {
    useBoardStore.getState().optimisticMoveList('l2', null, 'l1');
    expect(useBoardStore.getState().listOrder).toEqual(['l2', 'l1']);
  });

  it('drops an archived card out of the board', () => {
    const archived = { ...card('c1', 'l1', 'a0'), archived: true };
    useBoardStore.getState().upsertCard(archived);
    expect(useBoardStore.getState().cardsByList.l1).toEqual(['c2']);
  });
});

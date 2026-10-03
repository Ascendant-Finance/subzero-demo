'use client';

import {
  positionAtEnd,
  positionBetween,
  type Board,
  type BoardBootstrapResponse,
  type BoardMember,
  type Card,
  type Label,
  type List,
  type PresenceViewer,
} from '@trello-clone/shared';
import { create } from 'zustand';

interface BoardState {
  boardId: string | null;
  board: Board | null;
  members: BoardMember[];
  labels: Label[];
  lists: Record<string, List>;
  listOrder: string[];
  cards: Record<string, Card>;
  cardsByList: Record<string, string[]>;
  viewers: PresenceViewer[];

  hydrate: (payload: BoardBootstrapResponse) => void;
  reset: () => void;

  setBoard: (board: Board) => void;
  setViewers: (viewers: PresenceViewer[]) => void;
  setLabels: (labels: Label[]) => void;
  setMembers: (members: BoardMember[]) => void;

  upsertList: (list: List) => void;
  removeList: (listId: string) => void;
  applyListMoved: (listId: string, position: string) => void;
  applyListsReordered: (orderedListIds: string[]) => void;

  upsertCard: (card: Card) => void;
  removeCard: (cardId: string) => void;
  applyCardMoved: (cardId: string, listId: string, position: string) => void;
  applyListReordered: (listId: string, orderedCardIds: string[]) => void;

  /**
   * Applies a drag locally before the server answers. The provisional key is
   * only ever used to sort this client's own view; the client never sends a
   * position to the server (spec section 5.1).
   */
  optimisticMoveCard: (
    cardId: string,
    targetListId: string,
    beforeCardId: string | null,
    afterCardId: string | null,
  ) => void;
  optimisticMoveList: (
    listId: string,
    beforeListId: string | null,
    afterListId: string | null,
  ) => void;
}

const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

function sortListOrder(lists: Record<string, List>): string[] {
  return Object.values(lists)
    .filter((list) => !list.archived)
    .sort(byPosition)
    .map((list) => list.id);
}

function sortCardsByList(cards: Record<string, Card>): Record<string, string[]> {
  const grouped: Record<string, Card[]> = {};
  for (const card of Object.values(cards)) {
    if (card.archived) continue;
    (grouped[card.listId] ??= []).push(card);
  }
  const result: Record<string, string[]> = {};
  for (const [listId, listCards] of Object.entries(grouped)) {
    result[listId] = listCards.sort(byPosition).map((card) => card.id);
  }
  return result;
}

/** Provisional key between two neighbours, for local sorting only. */
function provisionalPosition(
  cards: Record<string, Card>,
  siblingIds: string[],
  beforeCardId: string | null,
  afterCardId: string | null,
): string {
  const before = beforeCardId ? cards[beforeCardId]?.position ?? null : null;
  const after = afterCardId ? cards[afterCardId]?.position ?? null : null;
  try {
    if (before || after) return positionBetween(before, after);
    const last = siblingIds.length ? cards[siblingIds[siblingIds.length - 1]]?.position : null;
    return positionAtEnd(last ?? null);
  } catch {
    // A stale neighbour can produce an invalid pair; the authoritative
    // card:moved event will correct the order moments later.
    const last = siblingIds.length ? cards[siblingIds[siblingIds.length - 1]]?.position : null;
    return positionAtEnd(last ?? null);
  }
}

const emptyState = {
  boardId: null,
  board: null,
  members: [],
  labels: [],
  lists: {},
  listOrder: [],
  cards: {},
  cardsByList: {},
  viewers: [],
};

export const useBoardStore = create<BoardState>((set, get) => ({
  ...emptyState,

  hydrate: (payload) =>
    set(() => {
      const lists: Record<string, List> = {};
      payload.lists.forEach((list) => {
        lists[list.id] = list;
      });
      const cards: Record<string, Card> = {};
      payload.cards.forEach((card) => {
        cards[card.id] = card;
      });
      const cardsByList = sortCardsByList(cards);
      payload.lists.forEach((list) => {
        cardsByList[list.id] ??= [];
      });
      return {
        boardId: payload.board.id,
        board: payload.board,
        members: payload.members,
        labels: payload.labels,
        lists,
        listOrder: sortListOrder(lists),
        cards,
        cardsByList,
      };
    }),

  reset: () => set(() => ({ ...emptyState })),

  setBoard: (board) => set(() => ({ board })),
  setViewers: (viewers) => set(() => ({ viewers })),
  setLabels: (labels) => set(() => ({ labels })),
  setMembers: (members) => set(() => ({ members })),

  upsertList: (list) =>
    set((state) => {
      const lists = { ...state.lists, [list.id]: list };
      const cardsByList = { ...state.cardsByList };
      cardsByList[list.id] ??= [];
      return { lists, listOrder: sortListOrder(lists), cardsByList };
    }),

  removeList: (listId) =>
    set((state) => {
      const lists = { ...state.lists };
      delete lists[listId];
      const cardsByList = { ...state.cardsByList };
      delete cardsByList[listId];
      return { lists, listOrder: sortListOrder(lists), cardsByList };
    }),

  applyListMoved: (listId, position) =>
    set((state) => {
      const existing = state.lists[listId];
      if (!existing) return {};
      const lists = { ...state.lists, [listId]: { ...existing, position } };
      return { lists, listOrder: sortListOrder(lists) };
    }),

  applyListsReordered: (orderedListIds) =>
    set((state) => {
      // The server rebalanced: adopt its order and evenly spaced keys.
      const lists = { ...state.lists };
      orderedListIds.forEach((id, index) => {
        if (lists[id]) lists[id] = { ...lists[id], position: `r${String(index).padStart(6, '0')}` };
      });
      return { lists, listOrder: orderedListIds.filter((id) => lists[id]) };
    }),

  upsertCard: (card) =>
    set((state) => {
      const cards = { ...state.cards, [card.id]: card };
      const cardsByList = sortCardsByList(cards);
      Object.keys(state.lists).forEach((listId) => {
        cardsByList[listId] ??= [];
      });
      return { cards, cardsByList };
    }),

  removeCard: (cardId) =>
    set((state) => {
      const cards = { ...state.cards };
      delete cards[cardId];
      const cardsByList = sortCardsByList(cards);
      Object.keys(state.lists).forEach((listId) => {
        cardsByList[listId] ??= [];
      });
      return { cards, cardsByList };
    }),

  applyCardMoved: (cardId, listId, position) =>
    set((state) => {
      const existing = state.cards[cardId];
      if (!existing) return {};
      const cards = { ...state.cards, [cardId]: { ...existing, listId, position } };
      const cardsByList = sortCardsByList(cards);
      Object.keys(state.lists).forEach((id) => {
        cardsByList[id] ??= [];
      });
      return { cards, cardsByList };
    }),

  applyListReordered: (listId, orderedCardIds) =>
    set((state) => {
      const cards = { ...state.cards };
      orderedCardIds.forEach((id, index) => {
        if (cards[id]) {
          cards[id] = { ...cards[id], listId, position: `r${String(index).padStart(6, '0')}` };
        }
      });
      const cardsByList = { ...state.cardsByList, [listId]: orderedCardIds.filter((id) => cards[id]) };
      return { cards, cardsByList };
    }),

  optimisticMoveCard: (cardId, targetListId, beforeCardId, afterCardId) => {
    const state = get();
    const card = state.cards[cardId];
    if (!card) return;
    const siblings = (state.cardsByList[targetListId] ?? []).filter((id) => id !== cardId);
    const position = provisionalPosition(state.cards, siblings, beforeCardId, afterCardId);
    state.applyCardMoved(cardId, targetListId, position);
  },

  optimisticMoveList: (listId, beforeListId, afterListId) => {
    const state = get();
    const list = state.lists[listId];
    if (!list) return;
    const before = beforeListId ? state.lists[beforeListId]?.position ?? null : null;
    const after = afterListId ? state.lists[afterListId]?.position ?? null : null;
    let position: string;
    try {
      position = before || after ? positionBetween(before, after) : positionAtEnd(list.position);
    } catch {
      position = positionAtEnd(list.position);
    }
    state.applyListMoved(listId, position);
  },
}));

/** Selector helpers used by the board components. */
export const selectListCards = (listId: string) => (state: BoardState) =>
  state.cardsByList[listId] ?? [];

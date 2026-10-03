'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  WS_EVENTS,
  type Card,
  type Checklist,
  type Comment,
  type Label,
  type List,
  type PresenceViewer,
} from '@trello-clone/shared';
import { useEffect } from 'react';
import { useBoardStore } from '@/stores/board-store';
import { getSocket } from './socket-client';

/**
 * Opens the board room and applies every server event to the store. All state
 * that other clients can change flows through here (spec section 8.3).
 */
export function useBoardSocket(boardId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!boardId) return;
    const socket = getSocket();
    const store = useBoardStore.getState();

    const open = () => socket.emit(WS_EVENTS.BOARD_OPEN, { boardId });
    if (socket.connected) open();
    socket.on('connect', open);

    const onCardCreated = ({ card }: { card: Card }) => store.upsertCard(card);
    const onCardUpdated = ({ card }: { card: Card }) => {
      store.upsertCard(card);
      queryClient.invalidateQueries({ queryKey: ['card', card.id] });
    };
    const onCardMoved = (payload: { cardId: string; listId: string; position: string }) =>
      store.applyCardMoved(payload.cardId, payload.listId, payload.position);
    const onCardDeleted = ({ cardId }: { cardId: string }) => store.removeCard(cardId);

    const onListCreated = ({ list }: { list: List }) => store.upsertList(list);
    const onListUpdated = ({ list }: { list: List }) =>
      list.archived ? store.removeList(list.id) : store.upsertList(list);
    const onListMoved = (payload: { listId: string; position: string }) =>
      store.applyListMoved(payload.listId, payload.position);
    const onListReordered = (payload: { listId: string; orderedCardIds: string[] }) =>
      store.applyListReordered(payload.listId, payload.orderedCardIds);
    const onListsReordered = (payload: { orderedListIds: string[] }) =>
      store.applyListsReordered(payload.orderedListIds);

    const onLabelChanged = (payload: { cardId: string; labels: Label[] }) =>
      queryClient.invalidateQueries({ queryKey: ['card', payload.cardId] });
    const onMemberChanged = (payload: { cardId: string }) =>
      queryClient.invalidateQueries({ queryKey: ['card', payload.cardId] });
    const onChecklistChanged = (payload: { cardId: string; checklists: Checklist[] }) =>
      queryClient.invalidateQueries({ queryKey: ['card', payload.cardId] });
    const onCommentCreated = ({ comment }: { comment: Comment }) =>
      queryClient.invalidateQueries({ queryKey: ['card', comment.cardId] });

    const onPresence = (payload: { boardId: string; viewers: PresenceViewer[] }) => {
      if (payload.boardId === boardId) store.setViewers(payload.viewers);
    };
    const onActivity = (payload: { activity?: { type?: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['board-activity', boardId] });
      // Board membership has no event of its own in the websocket contract, so
      // the membership activity is what tells other viewers to refetch the
      // board and pick up the new member.
      if (payload?.activity?.type?.startsWith('board.member')) {
        queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      }
    };

    socket.on(WS_EVENTS.CARD_CREATED, onCardCreated);
    socket.on(WS_EVENTS.CARD_UPDATED, onCardUpdated);
    socket.on(WS_EVENTS.CARD_MOVED, onCardMoved);
    socket.on(WS_EVENTS.CARD_DELETED, onCardDeleted);
    socket.on(WS_EVENTS.LIST_CREATED, onListCreated);
    socket.on(WS_EVENTS.LIST_UPDATED, onListUpdated);
    socket.on(WS_EVENTS.LIST_MOVED, onListMoved);
    socket.on(WS_EVENTS.LIST_REORDERED, onListReordered);
    socket.on(WS_EVENTS.BOARD_LISTS_REORDERED, onListsReordered);
    socket.on(WS_EVENTS.LABEL_CHANGED, onLabelChanged);
    socket.on(WS_EVENTS.MEMBER_CHANGED, onMemberChanged);
    socket.on(WS_EVENTS.CHECKLIST_CHANGED, onChecklistChanged);
    socket.on(WS_EVENTS.COMMENT_CREATED, onCommentCreated);
    socket.on(WS_EVENTS.PRESENCE_UPDATED, onPresence);
    socket.on(WS_EVENTS.ACTIVITY_NEW, onActivity);

    // Keeps this viewer alive in the presence set.
    const ping = setInterval(() => socket.emit(WS_EVENTS.PRESENCE_PING, { boardId }), 30_000);

    return () => {
      clearInterval(ping);
      socket.emit(WS_EVENTS.BOARD_CLOSE, { boardId });
      socket.off('connect', open);
      socket.off(WS_EVENTS.CARD_CREATED, onCardCreated);
      socket.off(WS_EVENTS.CARD_UPDATED, onCardUpdated);
      socket.off(WS_EVENTS.CARD_MOVED, onCardMoved);
      socket.off(WS_EVENTS.CARD_DELETED, onCardDeleted);
      socket.off(WS_EVENTS.LIST_CREATED, onListCreated);
      socket.off(WS_EVENTS.LIST_UPDATED, onListUpdated);
      socket.off(WS_EVENTS.LIST_MOVED, onListMoved);
      socket.off(WS_EVENTS.LIST_REORDERED, onListReordered);
      socket.off(WS_EVENTS.BOARD_LISTS_REORDERED, onListsReordered);
      socket.off(WS_EVENTS.LABEL_CHANGED, onLabelChanged);
      socket.off(WS_EVENTS.MEMBER_CHANGED, onMemberChanged);
      socket.off(WS_EVENTS.CHECKLIST_CHANGED, onChecklistChanged);
      socket.off(WS_EVENTS.COMMENT_CREATED, onCommentCreated);
      socket.off(WS_EVENTS.PRESENCE_UPDATED, onPresence);
      socket.off(WS_EVENTS.ACTIVITY_NEW, onActivity);
    };
  }, [boardId, queryClient]);
}

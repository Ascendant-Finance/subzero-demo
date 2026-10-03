'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { COPY, WS_EVENTS } from '@trello-clone/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ListColumn } from '@/components/board/list-column';
import { trello } from '@/lib/api';
import { getSocket } from '@/lib/socket-client';
import { useBoardStore } from '@/stores/board-store';

interface BoardCanvasProps {
  canEdit: boolean;
  onOpenCard: (cardId: string) => void;
  visibleCardIds: Set<string> | null;
}

/** Neighbour ids around `id` in an ordered array. The server needs only these. */
function neighboursOf(ordered: string[], id: string) {
  const index = ordered.indexOf(id);
  return {
    before: index > 0 ? ordered[index - 1] : null,
    after: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}

export function BoardCanvas({ canEdit, onOpenCard, visibleCardIds }: BoardCanvasProps) {
  const boardId = useBoardStore((state) => state.boardId);
  const lists = useBoardStore((state) => state.lists);
  const listOrder = useBoardStore((state) => state.listOrder);
  const cards = useBoardStore((state) => state.cards);
  const cardsByList = useBoardStore((state) => state.cardsByList);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [listTitle, setListTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const listIdOf = (id: string): string | null => {
    if (lists[id]) return id;
    if (cards[id]) return cards[id].listId;
    if (id.startsWith('list-drop-')) return id.slice('list-drop-'.length);
    return null;
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  /** Keeps the board visually correct mid drag, across and within lists. */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCardId = String(active.id);
    if (!cards[activeCardId]) return;

    const targetListId = listIdOf(String(over.id));
    if (!targetListId) return;

    const sourceListId = cards[activeCardId].listId;
    const overId = String(over.id);
    const store = useBoardStore.getState();

    if (sourceListId === targetListId) {
      const current = cardsByList[targetListId] ?? [];
      const fromIndex = current.indexOf(activeCardId);
      const toIndex = cards[overId] ? current.indexOf(overId) : current.length - 1;
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      const reordered = arrayMove(current, fromIndex, toIndex);
      const { before, after } = neighboursOf(reordered, activeCardId);
      store.optimisticMoveCard(activeCardId, targetListId, before, after);
      return;
    }

    const target = (cardsByList[targetListId] ?? []).filter((id) => id !== activeCardId);
    const insertAt = cards[overId] ? target.indexOf(overId) : target.length;
    const projected = [...target];
    projected.splice(insertAt < 0 ? target.length : insertAt, 0, activeCardId);
    const { before, after } = neighboursOf(projected, activeCardId);
    store.optimisticMoveCard(activeCardId, targetListId, before, after);
  }

  /**
   * The optimistic order is already applied, so the final neighbours are simply
   * the entries either side of the dragged item. Only ids are sent; the server
   * computes the authoritative key and broadcasts it back (spec section 5.1).
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !canEdit || !boardId) return;

    const draggedId = String(active.id);
    const socket = getSocket();
    const state = useBoardStore.getState();

    if (state.lists[draggedId]) {
      const current = state.listOrder;
      const fromIndex = current.indexOf(draggedId);
      const overListId = listIdOf(String(over.id));
      const toIndex = overListId ? current.indexOf(overListId) : fromIndex;
      if (fromIndex === -1 || toIndex === -1) return;

      const reordered = arrayMove(current, fromIndex, toIndex);
      const { before, after } = neighboursOf(reordered, draggedId);
      state.optimisticMoveList(draggedId, before, after);
      socket.emit(WS_EVENTS.LIST_MOVE, {
        listId: draggedId,
        beforeListId: before,
        afterListId: after,
      });
      return;
    }

    const card = state.cards[draggedId];
    if (!card) return;
    const ordered = state.cardsByList[card.listId] ?? [];
    const { before, after } = neighboursOf(ordered, draggedId);
    socket.emit(WS_EVENTS.CARD_MOVE, {
      cardId: draggedId,
      targetListId: card.listId,
      beforeCardId: before,
      afterCardId: after,
    });
  }

  async function addCard(listId: string, title: string) {
    await trello.cards.create(listId, title);
  }

  async function addList(event: React.FormEvent) {
    event.preventDefault();
    const value = listTitle.trim();
    if (!value || !boardId) return;
    setListTitle('');
    setAddingList(false);
    await trello.lists.create(boardId, value);
  }

  const activeCard = activeId ? cards[activeId] : null;
  const activeList = activeId ? lists[activeId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="board-scroll flex h-full items-start gap-3 overflow-x-auto p-3">
        <SortableContext items={listOrder} strategy={horizontalListSortingStrategy}>
          {listOrder.map((listId) => {
            const list = lists[listId];
            if (!list) return null;
            const ids = cardsByList[listId] ?? [];
            const filtered = visibleCardIds ? ids.filter((id) => visibleCardIds.has(id)) : ids;
            return (
              <ListColumn
                key={listId}
                list={list}
                cardIds={filtered}
                canEdit={canEdit}
                onAddCard={addCard}
                onRenameList={(id, title) => trello.lists.update(id, { title })}
                onArchiveList={(id) => trello.lists.update(id, { archived: true })}
                onOpenCard={onOpenCard}
              />
            );
          })}
        </SortableContext>

        {canEdit && (
          <div className="w-[272px] shrink-0">
            {addingList ? (
              <form onSubmit={addList} className="rounded-[var(--radius)] bg-[var(--color-list-bg)] p-2">
                <input
                  autoFocus
                  value={listTitle}
                  onChange={(event) => setListTitle(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && setAddingList(false)}
                  placeholder={COPY['board.addList.placeholder']}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white"
                  >
                    Add list
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingList(false)}
                    aria-label="Cancel"
                    className="rounded p-1 hover:bg-black/10"
                  >
                    <X size={16} />
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingList(true)}
                className="flex w-full items-center gap-1 rounded-[var(--radius)] bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--color-text)] backdrop-blur hover:bg-white"
              >
                <Plus size={16} /> {COPY['board.addList']}
              </button>
            )}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeCard && (
          <div className="w-[256px] rotate-2 rounded-[var(--radius-sm)] bg-[var(--color-card-bg)] p-2 text-sm shadow-lg">
            {activeCard.title}
          </div>
        )}
        {activeList && (
          <div className="w-[272px] rotate-1 rounded-[var(--radius)] bg-[var(--color-list-bg)] p-2 text-sm font-semibold shadow-lg">
            {activeList.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

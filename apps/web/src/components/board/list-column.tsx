'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { COPY, type List } from '@trello-clone/shared';
import { GripVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { CardFront } from '@/components/board/card-front';
import { useBoardStore } from '@/stores/board-store';

interface ListColumnProps {
  list: List;
  cardIds: string[];
  canEdit: boolean;
  onAddCard: (listId: string, title: string) => void;
  onRenameList: (listId: string, title: string) => void;
  onArchiveList: (listId: string) => void;
  onOpenCard: (cardId: string) => void;
}

export function ListColumn({
  list,
  cardIds,
  canEdit,
  onAddCard,
  onRenameList,
  onArchiveList,
  onOpenCard,
}: ListColumnProps) {
  const cards = useBoardStore((state) => state.cards);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(list.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list', listId: list.id },
  });

  // A separate droppable keeps an empty list a valid drop target for cards.
  const { setNodeRef: setDropRef } = useDroppable({
    id: `list-drop-${list.id}`,
    data: { type: 'list-drop', listId: list.id },
  });

  function submitCard(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onAddCard(list.id, value);
    setDraft('');
  }

  return (
    <div
      ref={setNodeRef}
      data-testid="list"
      data-list-title={list.title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex max-h-full w-[272px] shrink-0 flex-col rounded-[var(--radius)] bg-[var(--color-list-bg)]/95 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        {canEdit && (
          <button
            type="button"
            aria-label={`Reorder ${list.title}`}
            className="cursor-grab rounded p-1 text-[var(--color-text-muted)] hover:bg-black/10"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        )}

        {editingTitle && canEdit ? (
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const value = title.trim();
              if (value && value !== list.title) onRenameList(list.id, value);
              setEditingTitle(false);
            }}
          >
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => setEditingTitle(false)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-accent)] px-2 py-1 text-sm font-semibold outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => canEdit && setEditingTitle(true)}
            className="flex-1 truncate px-1 text-left text-sm font-semibold"
          >
            {list.title}
          </button>
        )}

        <span className="px-1 text-xs text-[var(--color-text-muted)]">{cardIds.length}</span>

        {canEdit && (
          <button
            type="button"
            aria-label={`Archive ${list.title}`}
            onClick={() => onArchiveList(list.id)}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-black/10"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div ref={setDropRef} className="min-h-2 flex-1 overflow-y-auto px-2">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2 pb-2">
            {cardIds.map((cardId) => {
              const card = cards[cardId];
              return card ? <CardFront key={cardId} card={card} onOpen={onOpenCard} /> : null;
            })}
          </ul>
        </SortableContext>
      </div>

      {canEdit && (
        <div className="p-2">
          {adding ? (
            <form onSubmit={submitCard}>
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) submitCard(event);
                  if (event.key === 'Escape') setAdding(false);
                }}
                placeholder={COPY['list.addCard.placeholder']}
                rows={2}
                className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white"
                >
                  Add card
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  aria-label="Cancel"
                  className="rounded p-1 text-[var(--color-text-muted)] hover:bg-black/10"
                >
                  <X size={16} />
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-black/10"
            >
              <Plus size={16} /> {COPY['list.addCard']}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

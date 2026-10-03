'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card, Label } from '@trello-clone/shared';
import { CheckSquare, Clock, MessageSquare, Paperclip } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useBoardStore } from '@/stores/board-store';

function dueClasses(card: Card) {
  if (!card.dueAt) return '';
  if (card.dueComplete) return 'bg-[var(--color-success)] text-white';
  return new Date(card.dueAt).getTime() < Date.now()
    ? 'bg-[var(--color-danger)] text-white'
    : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
}

function formatDue(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CardFront({ card, onOpen }: { card: Card; onOpen: (cardId: string) => void }) {
  const labels = useBoardStore((state) => state.labels);
  const members = useBoardStore((state) => state.members);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', cardId: card.id, listId: card.listId },
  });

  const cardLabels = (card.labelIds ?? [])
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is Label => Boolean(label));

  const cardMembers = (card.memberIds ?? [])
    .map((id) => members.find((member) => member.userId === id)?.user)
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const hasBadges =
    Boolean(card.dueAt) ||
    Boolean(card.checklistTotal) ||
    Boolean(card.commentCount) ||
    Boolean(card.attachmentCount) ||
    cardMembers.length > 0;

  return (
    <li
      ref={setNodeRef}
      data-testid="card"
      data-card-title={card.title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(card.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onOpen(card.id);
          }
        }}
        className="cursor-pointer rounded-[var(--radius-sm)] bg-[var(--color-card-bg)] p-2 shadow-sm hover:ring-2 hover:ring-[var(--color-accent)]"
      >
        {card.coverType === 'image' && card.coverValue && (
          <img
            src={card.coverValue}
            alt=""
            className="mb-2 max-h-32 w-full rounded-[var(--radius-sm)] object-cover"
          />
        )}
        {card.coverType === 'color' && card.coverValue && (
          <div
            className="mb-2 h-8 w-full rounded-[var(--radius-sm)]"
            style={{ background: card.coverValue }}
          />
        )}

        {cardLabels.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {cardLabels.map((label) => (
              <span
                key={label.id}
                title={label.name || label.color}
                className="h-2 w-9 rounded-full"
                style={{ background: label.color }}
              />
            ))}
          </div>
        )}

        <p data-testid="card-title" className="text-sm leading-snug">
          {card.title}
        </p>

        {hasBadges && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
            {card.dueAt && (
              <span
                className={`flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 ${dueClasses(card)}`}
              >
                <Clock size={12} /> {formatDue(card.dueAt)}
              </span>
            )}
            {Boolean(card.checklistTotal) && (
              <span className="flex items-center gap-1">
                <CheckSquare size={12} /> {card.checklistDone}/{card.checklistTotal}
              </span>
            )}
            {Boolean(card.commentCount) && (
              <span className="flex items-center gap-1">
                <MessageSquare size={12} /> {card.commentCount}
              </span>
            )}
            {Boolean(card.attachmentCount) && (
              <span className="flex items-center gap-1">
                <Paperclip size={12} /> {card.attachmentCount}
              </span>
            )}
            <span className="ml-auto flex -space-x-1">
              {cardMembers.map((user) => (
                <Avatar key={user.id} name={user.name} avatarUrl={user.avatarUrl} size={22} />
              ))}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

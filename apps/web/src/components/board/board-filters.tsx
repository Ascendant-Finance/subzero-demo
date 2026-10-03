'use client';

import { COPY, type DueFilter } from '@trello-clone/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { trello } from '@/lib/api';
import { useBoardStore } from '@/stores/board-store';

export interface BoardFilterValue {
  q: string;
  labelIds: string[];
  memberIds: string[];
  due: DueFilter | '';
}

const EMPTY: BoardFilterValue = { q: '', labelIds: [], memberIds: [], due: '' };

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'day', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
  { value: 'month', label: 'Due this month' },
  { value: 'none', label: 'No due date' },
  { value: 'complete', label: 'Marked complete' },
];

/**
 * Board search and filters. An active filter narrows the board to the matching
 * card ids; the server does the matching over the tsvector index.
 */
export function BoardFilters({
  boardId,
  onChange,
}: {
  boardId: string;
  onChange: (ids: Set<string> | null) => void;
}) {
  const labels = useBoardStore((state) => state.labels);
  const members = useBoardStore((state) => state.members);
  const [value, setValue] = useState<BoardFilterValue>(EMPTY);
  const [open, setOpen] = useState(false);
  const [empty, setEmpty] = useState(false);

  const active =
    Boolean(value.q.trim()) || value.labelIds.length > 0 || value.memberIds.length > 0 || value.due;

  useEffect(() => {
    if (!active) {
      onChange(null);
      setEmpty(false);
      return;
    }
    const params = new URLSearchParams();
    if (value.q.trim()) params.set('q', value.q.trim());
    if (value.labelIds.length) params.set('labelIds', value.labelIds.join(','));
    if (value.memberIds.length) params.set('memberIds', value.memberIds.join(','));
    if (value.due) params.set('due', value.due);

    const timer = setTimeout(async () => {
      try {
        const result = await trello.boards.search(boardId, params.toString());
        onChange(new Set(result.cards.map((card) => card.id)));
        setEmpty(result.cards.length === 0);
      } catch {
        onChange(null);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [active, boardId, onChange, value]);

  const toggle = (key: 'labelIds' | 'memberIds', id: string) =>
    setValue((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((item) => item !== id)
        : [...current[key], id],
    }));

  return (
    <div className="relative flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-white/20 px-2 py-1 text-white">
        <Search size={14} />
        <input
          value={value.q}
          onChange={(event) => setValue((current) => ({ ...current, q: event.target.value }))}
          placeholder={COPY['search.placeholder']}
          aria-label={COPY['search.placeholder']}
          className="w-44 bg-transparent text-sm outline-none placeholder:text-white/70"
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-[var(--radius-sm)] bg-white/20 px-2 py-1 text-sm text-white hover:bg-white/30"
      >
        Filters
        {active && <span className="ml-1 rounded-full bg-white px-1.5 text-xs text-[var(--color-text)]">on</span>}
      </button>

      {active && (
        <button
          type="button"
          onClick={() => setValue(EMPTY)}
          aria-label="Clear filters"
          className="rounded p-1 text-white hover:bg-white/20"
        >
          <X size={14} />
        </button>
      )}

      {empty && (
        <span className="rounded-[var(--radius-sm)] bg-white/20 px-2 py-1 text-xs text-white">
          {COPY['search.empty']}
        </span>
      )}

      {open && (
        <div className="absolute left-0 top-10 z-40 w-72 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
          <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Labels</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => toggle('labelIds', label.id)}
                className="h-6 w-12 rounded-[var(--radius-sm)]"
                style={{
                  background: label.color,
                  outline: value.labelIds.includes(label.id) ? '2px solid var(--color-text)' : 'none',
                }}
                aria-label={`Filter by ${label.name || label.color}`}
              />
            ))}
          </div>

          <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Members</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {members.map((member) => (
              <button
                key={member.userId}
                type="button"
                onClick={() => toggle('memberIds', member.userId)}
                className={`rounded-full ${
                  value.memberIds.includes(member.userId) ? 'ring-2 ring-[var(--color-accent)]' : ''
                }`}
                aria-label={`Filter by ${member.user?.name}`}
              >
                <Avatar name={member.user?.name ?? 'User'} avatarUrl={member.user?.avatarUrl} size={26} />
              </button>
            ))}
          </div>

          <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Due date</p>
          <select
            value={value.due}
            onChange={(event) =>
              setValue((current) => ({ ...current, due: event.target.value as DueFilter | '' }))
            }
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm"
          >
            <option value="">Any</option>
            {DUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

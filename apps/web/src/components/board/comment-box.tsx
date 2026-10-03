'use client';

import { COPY, activeMentionQuery } from '@trello-clone/shared';
import { useMemo, useRef, useState } from 'react';
import { useBoardStore } from '@/stores/board-store';

/**
 * Comment composer with `@name` autocomplete over the board members.
 * The server re-parses mentions, so this only helps the author type them.
 */
export function CommentBox({ onSubmit }: { onSubmit: (text: string) => Promise<void> | void }) {
  const members = useBoardStore((state) => state.members);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const query = useMemo(() => activeMentionQuery(text, caret), [text, caret]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const needle = query.trim().toLowerCase();
    return members
      .map((member) => member.user)
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .filter((user) => !needle || user.name.toLowerCase().includes(needle))
      .slice(0, 5);
  }, [members, query]);

  function applyMention(name: string) {
    if (query === null) return;
    const before = text.slice(0, caret);
    const start = before.lastIndexOf('@');
    if (start === -1) return;
    const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`;
    setText(next);
    const nextCaret = start + name.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await onSubmit(value);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="relative">
      <textarea
        ref={inputRef}
        value={text}
        rows={3}
        onChange={(event) => {
          setText(event.target.value);
          setCaret(event.target.selectionStart ?? 0);
        }}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        placeholder={COPY['card.comment.placeholder']}
        className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />

      {suggestions.length > 0 && (
        <ul className="absolute bottom-14 left-2 z-10 w-56 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {suggestions.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => applyMention(user.name)}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]"
              >
                {user.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Comment
      </button>
    </form>
  );
}

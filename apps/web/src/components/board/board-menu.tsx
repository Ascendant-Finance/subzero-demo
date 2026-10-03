'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COPY, type BoardVisibility } from '@trello-clone/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { trello } from '@/lib/api';
import { useBoardStore } from '@/stores/board-store';

const BACKGROUNDS = ['#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1'];

const VISIBILITY_LABELS: Record<BoardVisibility, string> = {
  private: COPY['board.visibility.private'],
  workspace: COPY['board.visibility.workspace'],
  public: COPY['board.visibility.public'],
};

export function BoardMenu({ canAdmin, onClose }: { canAdmin: boolean; onClose: () => void }) {
  const board = useBoardStore((state) => state.board);
  const members = useBoardStore((state) => state.members);
  const setBoard = useBoardStore((state) => state.setBoard);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'activity' | 'settings' | 'members'>('activity');
  const [search, setSearch] = useState('');

  const { data: activity } = useQuery({
    queryKey: ['board-activity', board?.id],
    queryFn: () => trello.boards.activity(board!.id),
    enabled: Boolean(board?.id) && tab === 'activity',
  });

  const { data: userResults } = useQuery({
    queryKey: ['user-search', search],
    queryFn: () => trello.users.search(search),
    enabled: search.trim().length >= 2 && tab === 'members',
  });

  const updateBoard = useMutation({
    mutationFn: (body: Record<string, unknown>) => trello.boards.update(board!.id, body),
    onSuccess: (result) => setBoard(result.board),
  });

  const addMember = useMutation({
    mutationFn: (userId: string) => trello.boards.addMember(board!.id, userId),
    onSuccess: () => {
      setSearch('');
      queryClient.invalidateQueries({ queryKey: ['board', board?.id] });
    },
  });

  if (!board) return null;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-black/10 bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <span className="text-sm font-semibold">Board menu</span>
        <button type="button" onClick={onClose} aria-label="Close menu" className="rounded p-1 hover:bg-black/10">
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-[var(--color-border)] text-sm">
        {(['activity', 'members', 'settings'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 px-2 py-2 capitalize ${
              tab === value
                ? 'border-b-2 border-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'activity' && (
          <>
            {(activity?.activities ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">{COPY['activity.empty']}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {activity!.activities.map((item) => (
                  <li key={item.id} className="flex gap-2 text-sm">
                    <Avatar name={item.user?.name ?? 'Someone'} size={24} />
                    <div>
                      <p>
                        <span className="font-medium">{item.user?.name ?? 'Someone'}</span>{' '}
                        <span className="text-[var(--color-text-muted)]">
                          {item.type.replace(/[._]/g, ' ')}
                        </span>{' '}
                        {(item.data as any)?.cardTitle ?? (item.data as any)?.listTitle ?? ''}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'members' && (
          <>
            <ul className="mb-4 flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center gap-2 text-sm">
                  <Avatar name={member.user?.name ?? 'User'} avatarUrl={member.user?.avatarUrl} size={26} />
                  <span className="min-w-0 flex-1 truncate">{member.user?.name}</span>
                  {canAdmin ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        trello.boards
                          .updateMember(board.id, member.userId, event.target.value)
                          .then(() => queryClient.invalidateQueries({ queryKey: ['board', board.id] }))
                      }
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1 py-0.5 text-xs"
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                      <option value="observer">observer</option>
                    </select>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">{member.role}</span>
                  )}
                </li>
              ))}
            </ul>

            {canAdmin && (
              <>
                <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">
                  {COPY['board.members.invite']}
                </p>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search workspace people"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                />
                <ul className="mt-2 flex flex-col gap-1">
                  {(userResults?.users ?? [])
                    .filter((user) => !members.some((member) => member.userId === user.id))
                    .map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => addMember.mutate(user.id)}
                          className="w-full rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface-2)]"
                        >
                          {user.name}{' '}
                          <span className="text-xs text-[var(--color-text-muted)]">{user.email}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Visibility</p>
              <select
                disabled={!canAdmin}
                value={board.visibility}
                onChange={(event) => updateBoard.mutate({ visibility: event.target.value })}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm"
              >
                {(Object.keys(VISIBILITY_LABELS) as BoardVisibility[]).map((value) => (
                  <option key={value} value={value}>
                    {VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Background</p>
              <div className="flex flex-wrap gap-2">
                {BACKGROUNDS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    disabled={!canAdmin}
                    aria-label={`Background ${color}`}
                    onClick={() => updateBoard.mutate({ bgType: 'color', bgValue: color })}
                    className={`h-8 w-8 rounded-[var(--radius-sm)] ${
                      board.bgValue === color ? 'ring-2 ring-[var(--color-text)]' : ''
                    }`}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>

            {canAdmin && (
              <button
                type="button"
                onClick={() =>
                  board.closed
                    ? trello.boards.reopen(board.id).then((r) => setBoard(r.board))
                    : trello.boards.close(board.id).then((r) => setBoard(r.board))
                }
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold"
              >
                {board.closed ? 'Reopen board' : 'Close board'}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

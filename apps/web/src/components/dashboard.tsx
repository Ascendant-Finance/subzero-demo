'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Board, Workspace } from '@trello-clone/shared';
import { Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { TopBar } from '@/components/top-bar';
import { Spinner } from '@/components/ui/spinner';
import { trello } from '@/lib/api';

function BoardTile({ board, onToggleStar }: { board: Board; onToggleStar: (board: Board) => void }) {
  return (
    <div className="group relative">
      <Link
        href={`/boards/${board.id}`}
        className="flex h-24 flex-col justify-between rounded-[var(--radius)] p-3 text-white shadow-sm transition-transform hover:brightness-110"
        style={{ background: board.bgType === 'color' ? board.bgValue : undefined }}
      >
        <span className="line-clamp-2 font-semibold">{board.title}</span>
        {board.closed && <span className="text-xs opacity-80">Closed</span>}
      </Link>
      <button
        type="button"
        aria-label={board.starred ? 'Unstar board' : 'Star board'}
        onClick={() => onToggleStar(board)}
        className="absolute right-2 top-2 rounded p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <Star size={16} fill={board.starred ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function WorkspaceSection({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['workspace', workspace.id],
    queryFn: () => trello.workspaces.detail(workspace.id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workspace', workspace.id] });

  const createBoard = useMutation({
    mutationFn: (boardTitle: string) =>
      trello.boards.create(workspace.id, { title: boardTitle, bgValue: randomBackground() }),
    onSuccess: () => {
      setTitle('');
      setAdding(false);
      invalidate();
    },
  });

  const toggleStar = useMutation({
    mutationFn: (board: Board) =>
      board.starred ? trello.boards.unstar(board.id) : trello.boards.star(board.id),
    onSuccess: invalidate,
  });

  const invite = useMutation({
    mutationFn: () => trello.workspaces.createInvite(workspace.id),
  });

  if (isLoading) return <Spinner label="Loading workspace" />;

  const boards = data?.boards ?? [];
  const starred = boards.filter((board) => board.starred);

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{workspace.name}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => invite.mutate()}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-2)]"
          >
            Invite
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            {data?.members.length ?? 0} members
          </span>
        </div>
      </div>

      {invite.data && (
        <p className="mb-3 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
          Invite code: <code className="font-mono font-semibold">{invite.data.invite.code}</code>
        </p>
      )}

      {starred.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Starred
          </h3>
          <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {starred.map((board) => (
              <BoardTile key={board.id} board={board} onToggleStar={toggleStar.mutate} />
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {boards.map((board) => (
          <BoardTile key={board.id} board={board} onToggleStar={toggleStar.mutate} />
        ))}

        {adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim()) createBoard.mutate(title.trim());
            }}
            className="flex h-24 flex-col justify-between rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Board title"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-2 py-1 text-sm text-[var(--color-text-muted)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-24 items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--color-surface-2)] text-sm font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"
          >
            <Plus size={16} /> Create board
          </button>
        )}
      </div>
    </section>
  );
}

const BACKGROUNDS = ['#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1'];
const randomBackground = () => BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

export function Dashboard() {
  const queryClient = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => trello.workspaces.list(),
  });

  const createWorkspace = useMutation({
    mutationFn: (name: string) => trello.workspaces.create(name),
    onSuccess: () => {
      setWorkspaceName('');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const join = useMutation({
    mutationFn: (code: string) => trello.workspaces.join(code),
    onSuccess: () => {
      setJoinCode('');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {isLoading ? (
          <Spinner label="Loading your boards" />
        ) : (
          <>
            {(data?.workspaces ?? []).map((workspace) => (
              <WorkspaceSection key={workspace.id} workspace={workspace} />
            ))}

            <section className="grid gap-4 sm:grid-cols-2">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (workspaceName.trim()) createWorkspace.mutate(workspaceName.trim());
                }}
                className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <h3 className="mb-2 font-semibold">Create a workspace</h3>
                <div className="flex gap-2">
                  <input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="Workspace name"
                    className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white"
                  >
                    Create
                  </button>
                </div>
              </form>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (joinCode.trim()) join.mutate(joinCode.trim());
                }}
                className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <h3 className="mb-2 font-semibold">Join with an invite code</h3>
                <div className="flex gap-2">
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value)}
                    placeholder="Invite code"
                    className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1 text-sm font-semibold"
                  >
                    Join
                  </button>
                </div>
                {join.isError && (
                  <p className="mt-2 text-sm text-[var(--color-danger)]">That code did not work.</p>
                )}
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

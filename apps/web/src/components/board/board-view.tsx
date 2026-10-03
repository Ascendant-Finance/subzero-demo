'use client';

import { useQuery } from '@tanstack/react-query';
import { COPY } from '@trello-clone/shared';
import { Menu, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BoardCanvas } from '@/components/board/board-canvas';
import { BoardFilters } from '@/components/board/board-filters';
import { BoardMenu } from '@/components/board/board-menu';
import { CardModal } from '@/components/board/card-modal';
import { TopBar } from '@/components/top-bar';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { trello } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-store';
import { useBoardSocket } from '@/lib/use-board-socket';
import { useBoardStore } from '@/stores/board-store';

export function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrate = useBoardStore((state) => state.hydrate);
  const reset = useBoardStore((state) => state.reset);
  const board = useBoardStore((state) => state.board);
  const members = useBoardStore((state) => state.members);
  const viewers = useBoardStore((state) => state.viewers);

  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCardIds, setVisibleCardIds] = useState<Set<string> | null>(null);
  const [starred, setStarred] = useState(false);

  const openCardId = searchParams.get('card');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => trello.boards.bootstrap(boardId),
  });

  useEffect(() => {
    if (data) {
      hydrate(data);
      setStarred(Boolean(data.board.starred));
    }
    return () => reset();
  }, [data, hydrate, reset]);

  useBoardSocket(data ? boardId : null);

  const openCard = useCallback(
    (cardId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('card', cardId);
      router.replace(`/boards/${boardId}?${params.toString()}`, { scroll: false });
    },
    [boardId, router, searchParams],
  );

  const closeCard = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('card');
    const query = params.toString();
    router.replace(`/boards/${boardId}${query ? `?${query}` : ''}`, { scroll: false });
  }, [boardId, router, searchParams]);

  if (isLoading) return <Spinner label="Loading board" />;
  if (isError || !board) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <p className="p-8 text-center text-[var(--color-text-muted)]">
          This board is not available to you.
        </p>
      </div>
    );
  }

  const currentUser = getCurrentUser();
  const myRole = members.find((member) => member.userId === currentUser?.id)?.role ?? null;
  const canEdit = (myRole === 'admin' || myRole === 'member') && !board.closed;
  const canComment = canEdit || myRole === 'observer';
  const canAdmin = myRole === 'admin';

  async function toggleStar() {
    const next = !starred;
    setStarred(next);
    await (next ? trello.boards.star(boardId) : trello.boards.unstar(boardId));
  }

  return (
    <div
      className="flex h-screen flex-col"
      style={{ background: board.bgType === 'color' ? board.bgValue : undefined }}
    >
      <TopBar />

      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-white">
        <h1 className="text-lg font-bold">{board.title}</h1>

        <button type="button" onClick={toggleStar} aria-label="Star board" className="rounded p-1 hover:bg-white/20">
          <Star size={16} fill={starred ? 'currentColor' : 'none'} />
        </button>

        <span className="rounded-[var(--radius-sm)] bg-white/20 px-2 py-0.5 text-xs capitalize">
          {COPY[`board.visibility.${board.visibility}` as const]}
        </span>

        <div className="flex items-center gap-1" title={COPY['board.presence.viewing']}>
          <span className="text-xs opacity-80">{COPY['board.presence.viewing']}</span>
          <span className="flex -space-x-1.5">
            {viewers.map((viewer) => (
              <span key={viewer.userId} className="rounded-full ring-2 ring-white/70">
                <Avatar name={viewer.name} avatarUrl={viewer.avatarUrl} size={24} />
              </span>
            ))}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <BoardFilters boardId={boardId} onChange={setVisibleCardIds} />
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Board menu"
            className="rounded-[var(--radius-sm)] bg-white/20 p-1.5 hover:bg-white/30"
          >
            <Menu size={16} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <BoardCanvas canEdit={canEdit} onOpenCard={openCard} visibleCardIds={visibleCardIds} />
        </div>
        {menuOpen && <BoardMenu canAdmin={canAdmin} onClose={() => setMenuOpen(false)} />}
      </div>

      {openCardId && (
        <CardModal
          cardId={openCardId}
          canEdit={canEdit}
          canComment={canComment}
          onClose={closeCard}
        />
      )}
    </div>
  );
}

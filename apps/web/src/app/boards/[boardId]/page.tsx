'use client';

import { Suspense, use } from 'react';
import { BoardView } from '@/components/board/board-view';
import { Spinner } from '@/components/ui/spinner';
import { useSessionGate } from '@/app/providers';

export default function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = use(params);
  const status = useSessionGate();

  if (status !== 'ready') return <Spinner label="Checking your session" />;

  return (
    <Suspense fallback={<Spinner label="Loading board" />}>
      <BoardView boardId={boardId} />
    </Suspense>
  );
}

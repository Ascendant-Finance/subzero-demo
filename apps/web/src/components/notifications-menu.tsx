'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COPY, WS_EVENTS, type Notification } from '@trello-clone/shared';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { trello } from '@/lib/api';
import { getSocket } from '@/lib/socket-client';

const LABELS: Record<Notification['type'], string> = {
  mention: 'mentioned you',
  assigned: 'assigned you to a card',
  due_soon: 'card is due soon',
  added_to_board: 'added you to a board',
};

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => trello.notifications.list(),
  });

  const markAll = useMutation({
    mutationFn: () => trello.notifications.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Live notifications arrive on the caller's own user room.
  useEffect(() => {
    const socket = getSocket();
    const handler = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
    socket.on(WS_EVENTS.NOTIFICATION_NEW, handler);
    return () => {
      socket.off(WS_EVENTS.NOTIFICATION_NEW, handler);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative rounded-[var(--radius-sm)] p-2 hover:bg-black/10"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-xs font-semibold text-[var(--color-accent)]"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--color-text-muted)]">
              {COPY['notifications.empty']}
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((item) => {
                const title = (item.data as any)?.cardTitle ?? (item.data as any)?.boardTitle ?? '';
                const body = (
                  <span>
                    Someone {LABELS[item.type]}
                    {title ? `: ${title}` : ''}
                  </span>
                );
                return (
                  <li key={item.id}>
                    {item.boardId ? (
                      <Link
                        href={`/boards/${item.boardId}${item.cardId ? `?card=${item.cardId}` : ''}`}
                        onClick={() => setOpen(false)}
                        className={`block rounded-[var(--radius-sm)] px-2 py-2 text-sm hover:bg-[var(--color-surface-2)] ${
                          item.read ? 'text-[var(--color-text-muted)]' : 'font-medium'
                        }`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <span className="block px-2 py-2 text-sm">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

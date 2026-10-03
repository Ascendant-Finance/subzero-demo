'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Logo } from '@/components/ui/logo';
import { NotificationsMenu } from '@/components/notifications-menu';
import { trello } from '@/lib/api';
import { getCurrentUser, setSession } from '@/lib/auth-store';
import { disconnectSocket } from '@/lib/socket-client';
import { DEMO_MODE } from '@/lib/config';

export function TopBar({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const user = getCurrentUser();

  async function logout() {
    await trello.auth.logout().catch(() => undefined);
    setSession(null, null);
    disconnectSocket();
    router.replace('/login');
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-black/10 bg-[var(--color-surface)] px-3">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Logo size={22} />
        <span>Stacks</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>

      {DEMO_MODE && (
        <Link
          href="/welcome"
          className="rounded-[var(--radius-sm)] px-2 py-1 text-sm font-semibold text-[var(--color-accent)] hover:bg-black/10"
        >
          Demo guide
        </Link>
      )}

      <NotificationsMenu />

      {user && (
        <div className="flex items-center gap-2">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size={28} />
          <button
            type="button"
            onClick={logout}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--color-text-muted)] hover:bg-black/10"
          >
            Log out
          </button>
        </div>
      )}
    </header>
  );
}

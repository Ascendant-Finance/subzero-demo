'use client';

import { COPY } from '@trello-clone/shared';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { trello } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { DEMO_MODE } from '@/lib/config';
import { setSession } from '@/lib/auth-store';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cta = mode === 'login' ? COPY['auth.login.cta'] : COPY['auth.register.cta'];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'login'
          ? await trello.auth.login({ email, password })
          : await trello.auth.register({ email, password, name });
      setSession(result.accessToken, result.user);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : COPY['error.generic']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo size={28} />
          <span className="text-lg font-semibold">Stacks</span>
        </div>

        {mode === 'register' && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {error && (
          <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2 font-semibold text-white transition-colors hover:bg-[var(--color-accent-press)] disabled:opacity-60"
        >
          {cta}
        </button>

        <p className="mt-5 text-center text-sm text-[var(--color-text-muted)]">
          {mode === 'login' && DEMO_MODE ? (
            <>
              New here?{' '}
              <Link href="/start" className="font-semibold text-[var(--color-accent)]">
                Start a demo
              </Link>
            </>
          ) : mode === 'login' ? (
            <>
              Need an account?{' '}
              <Link href="/register" className="font-semibold text-[var(--color-accent)]">
                {COPY['auth.register.cta']}
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[var(--color-accent)]">
                {COPY['auth.login.cta']}
              </Link>
            </>
          )}
        </p>
      </form>
    </main>
  );
}

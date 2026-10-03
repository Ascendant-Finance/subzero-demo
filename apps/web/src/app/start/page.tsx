'use client';

import { COPY } from '@trello-clone/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { trello } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { setSession } from '@/lib/auth-store';
import { saveDemoCredentials } from '@/lib/demo-credentials';

const field =
  'w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 outline-none focus:border-[var(--color-accent)]';

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken, user, demo } = await trello.demo.signup({ name, email, company, website });
      saveDemoCredentials({ trelloPassword: demo.trelloPassword, subzero: demo.subzero });
      setSession(accessToken, user);
      router.replace('/welcome');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : COPY['error.generic']);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2 md:items-center">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Logo size={28} />
            <span className="text-lg font-semibold">Stacks × SubZero</span>
          </div>
          <h1 className="mb-3 text-3xl font-bold leading-tight">
            Watch your coding agent clear a production queue.
          </h1>
          <p className="mb-4 text-[var(--color-text-muted)]">
            Stacks is a small Trello clone with real bugs in its API. When it breaks, SubZero opens
            the incident on its own. You connect the agent you already use — Claude Code, Cursor,
            Codex or your own — and let it take the tickets, fix the code and close them out.
          </p>
          <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
            <li>• Your own SubZero sandbox and dashboard login, nobody else&apos;s tickets</li>
            <li>• A workspace that has already hit five production faults</li>
            <li>• The full source on GitHub, to point your agent at</li>
            <li>• About 20 minutes. Free. Sandbox closes after 14 days.</li>
          </ul>
        </section>

        <form
          onSubmit={submit}
          className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm"
        >
          <h2 className="mb-5 text-lg font-semibold">Start your demo</h2>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" className={field} />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Work email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={160} autoComplete="email" className={field} />
          </label>

          <label className="mb-5 block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
              Company <span className="font-normal">(optional)</span>
            </span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} autoComplete="organization" className={field} />
          </label>

          {/* Honeypot: invisible to people, irresistible to form bots. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

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
            {busy ? 'Setting up your sandbox…' : 'Create my sandbox'}
          </button>

          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            We&apos;ll use your email to follow up about SubZero. Everything in the sandbox is
            disposable sample data.
          </p>
          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            Already started?{' '}
            <Link href="/login" className="font-semibold text-[var(--color-accent)]">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

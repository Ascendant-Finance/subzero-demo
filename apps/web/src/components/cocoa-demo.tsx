'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trello, type CocoaDemoStatus } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
export function CocoaDemo() {
  const [state, setState] = useState<CocoaDemoStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await trello.demo.cocoa();
        if (!disposed) setState(s);
      } catch {
        if (!disposed)
          setError('Cocoa is not available right now. You can still use your own agent below.');
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 4000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
  async function act(action: 'start' | 'preview' | 'reset') {
    setBusy(true);
    setError('');
    try {
      setState(
        await (action === 'start'
          ? trello.demo.startCocoa()
          : action === 'preview'
            ? trello.demo.previewCocoa()
            : trello.demo.resetCocoa()),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Cocoa is temporarily unavailable. Your progress is saved; please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const run = state?.run;
  const canStart =
    state?.available &&
    (run?.status === 'ready' ||
      (state.incidentReady && state.attemptsRemaining > 0 && (!run || run.status === 'failed')));
  return (
    <section
      className="rounded-[var(--radius)] border border-[var(--color-accent)] bg-[var(--color-surface)] p-6"
      aria-labelledby="cocoa-title"
    >
      <p className="mb-2 text-sm font-semibold text-[var(--color-accent)]">
        Free guided demo · no setup or payment details
      </p>
      <h2 id="cocoa-title" className="text-xl font-bold">
        Let Cocoa fix your first issue
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Clearing a card’s description crashes the app. Cocoa diagnoses the incident and selects a
        reviewed repair for your demo board. Then you can try the repaired feature yourself.
      </p>
      {!run && (
        <p className="mt-3 text-sm">
          One guided diagnosis and one retry are included. No AI key or agent installation needed.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {state && !state.available && (
        <p className="mt-3 text-sm">
          Hosted demos are currently unavailable. You can explore the app or connect your own agent
          below.
        </p>
      )}
      {state?.available && !state.incidentReady && !run && (
        <p className="mt-3 text-sm" role="status">
          Preparing your sample incident… Cocoa will be ready once it appears in SubZero.
        </p>
      )}
      {canStart && (
        <button
          disabled={busy}
          onClick={() => void act('start')}
          className="mt-4 rounded bg-[var(--color-accent)] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? 'Cocoa is working…'
            : run?.status === 'ready'
              ? 'Finish applying the repair'
              : run
                ? 'Try Cocoa once more'
                : 'Let Cocoa fix this'}
        </button>
      )}
      {run && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="font-semibold">
            {run.status === 'running'
              ? 'Cocoa is diagnosing the incident…'
              : run.status === 'ready'
                ? 'Cocoa selected a reviewed repair.'
                : run.status === 'completed'
                  ? state?.repairApplied
                    ? 'Your reviewed repair is applied and checked.'
                    : 'Your repair was reset. The original demo behavior is restored.'
                  : 'Cocoa could not select a supported repair this time.'}
          </p>
          <p className="text-sm">Incident {run.ticketCode}</p>
          {run.error && <p className="text-sm">{run.error}</p>}
          {run.cause && (
            <div className="rounded bg-emerald-50 p-4 text-sm text-emerald-950">
              <p>
                <strong>What broke:</strong> {run.cause}
              </p>
              <p className="mt-2">
                <strong>Selected repair:</strong> {run.summary}
              </p>
              <p className="mt-2">
                This guided demo uses a repair reviewed and tested by our team. It applies only to
                your demo board.
              </p>
            </div>
          )}
          {state?.repairApplied && (
            <div className="space-y-3 rounded border border-[var(--color-border)] p-4">
              <h3 className="font-semibold">Try the repaired feature</h3>
              <p className="text-sm">
                Clear the sample card’s description and check that its title stays intact, or open
                your board to try it there.
              </p>
              <button
                disabled={busy}
                onClick={() => void act('preview')}
                className="rounded bg-[var(--color-accent)] px-4 py-2 text-white disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Clear the sample card’s description'}
              </button>
              {state.preview?.message && (
                <p className="text-sm" role="status">
                  {state.preview.message}
                </p>
              )}
              <p>
                <Link className="text-sm underline" href={'/boards/' + state.boardId}>
                  Open my repaired board
                </Link>
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer">Reset this repair</summary>
                <p className="my-2">
                  Restore the original bug on your board. This does not restore your free diagnosis
                  allowance.
                </p>
                <button disabled={busy} onClick={() => void act('reset')} className="underline">
                  Restore the original demo behavior
                </button>
              </details>
            </div>
          )}
          {run.status === 'failed' && state?.attemptsRemaining === 0 && (
            <p className="text-sm">
              Your free attempts have been used. Continue with your own agent below, or ask our team
              for a walkthrough.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

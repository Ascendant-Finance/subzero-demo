'use client';
import { useEffect, useState } from 'react';
import { trello, type CocoaDemoStatus } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
const stages: Record<string, string> = {
  queued: 'Your demo is queued. You can leave this page and return.',
  reproducing: 'Cocoa is reproducing the problem in your private copy.',
  fixing: 'Cocoa is reading the code and preparing a fix.',
  testing: 'Cocoa is checking that the fix works.',
  verified: 'The fix passed verification. Try it below.',
  completed: 'Your fix and verification results are saved.',
  failed: 'Cocoa could not verify a fix this time.',
};
export function CocoaDemo() {
  const [state, setState] = useState<CocoaDemoStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await trello.demo.cocoa();
        if (!disposed) {
          setState(s);
          setError('');
          if (s.run?.preview) setPreviewPending(false);
        }
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
    // One polling loop per mounted page; it never starts a paid operation.
  }, []);
  async function act(preview = false) {
    setBusy(true);
    setError('');
    try {
      setState(await (preview ? trello.demo.previewCocoa() : trello.demo.startCocoa()));
      if (preview) setPreviewPending(true);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Cocoa is temporarily unavailable. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const run = state?.run;
  const canStart =
    state?.available &&
    state.incidentReady &&
    state.attemptsRemaining > 0 &&
    (!run || run.status === 'failed');
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
        Clearing a card’s description crashes the app. Cocoa will reproduce the problem, change the
        code and test the fix in a private copy just for you.
      </p>
      {!run && (
        <p className="mt-3 text-sm">
          One guided fix and one retry are included. No AI key or agent installation needed.
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
          onClick={() => void act()}
          className="mt-4 rounded bg-[var(--color-accent)] px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Starting Cocoa…' : run ? 'Try Cocoa once more' : 'Let Cocoa fix this'}
        </button>
      )}
      {run && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="font-semibold">{stages[run.stage] ?? 'Checking your demo…'}</p>
          <p className="text-sm">Incident {run.ticketCode}</p>
          {run.error && <p className="text-sm">{run.error}</p>}
          {run.verification && (
            <>
              <div className="rounded bg-emerald-50 p-4 text-sm text-emerald-950">
                <p>
                  <strong>What broke:</strong> {run.cause}
                </p>
                <p className="mt-2">
                  <strong>What changed:</strong> {run.summary}
                </p>
                <p className="mt-2">
                  The same verification failed before the change and passed afterward. The shared
                  demo app has not been modified.
                </p>
              </div>
              {run.previewAvailable ? (
                <div className="rounded border border-[var(--color-border)] p-4">
                  <h3 className="font-semibold">Try the repaired feature</h3>
                  <p className="my-2 text-sm">
                    Cocoa’s private preview will create a sample card, clear its description, and
                    check that its title stays intact.
                  </p>
                  <button
                    disabled={busy || previewPending}
                    onClick={() => void act(true)}
                    className="rounded bg-[var(--color-accent)] px-4 py-2 text-white disabled:opacity-50"
                  >
                    {previewPending ? 'Trying the fix…' : 'Clear the sample card’s description'}
                  </button>
                  {run.preview && (
                    <p className="mt-2 text-sm" role="status">
                      {run.preview.message}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm">
                  The temporary preview has closed. Your results remain here.
                </p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer">Show the code change</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-3 text-xs text-slate-100">
                  {run.patch}
                </pre>
              </details>
            </>
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

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/top-bar';
import { Spinner } from '@/components/ui/spinner';
import { trello, type DemoCredentials, type DemoDetails } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-store';
import { loadDemoCredentials } from '@/lib/demo-credentials';
import { useSessionGate } from '../providers';

type AgentTab = 'claude' | 'hermes' | 'cursor' | 'codex';

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-slate-900 p-3 pr-16 text-xs leading-relaxed text-slate-100">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 flex items-center gap-3 font-semibold">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm text-white">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-3 text-sm text-[var(--color-text-muted)]">{children}</div>
    </section>
  );
}

export default function WelcomePage() {
  const status = useSessionGate();
  const [demo, setDemo] = useState<DemoDetails | null>(null);
  const [credentials, setCredentials] = useState<DemoCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AgentTab>('claude');

  useEffect(() => {
    if (status !== 'ready') return;
    setCredentials(loadDemoCredentials());
    trello.demo
      .me()
      .then((r) => setDemo(r.demo))
      .catch(() => setError('This account has no demo sandbox.'));
  }, [status]);

  if (status !== 'ready') return <Spinner label="Checking your session" />;
  if (error) return <p className="p-8 text-center">{error}</p>;
  if (!demo) return <Spinner label="Loading your sandbox" />;

  const email = getCurrentUser()?.email ?? '';
  const env = { SUBZERO_API_URL: demo.apiUrl };
  const repoDir = demo.repoUrl.split('/').pop() ?? 'subzero-demo';
  const snippets: Record<AgentTab, string> = {
    claude: `claude mcp add subzero \\
  --env SUBZERO_API_URL=${env.SUBZERO_API_URL} \\
  --env SUBZERO_AGENT_TOKEN=<your sz_agent_ token> \\
  -- npx -y @sub-zero/agent-mcp`,
    cursor: JSON.stringify(
      {
        mcpServers: {
          subzero: {
            command: 'npx',
            args: ['-y', '@sub-zero/agent-mcp'],
            env: { SUBZERO_API_URL: env.SUBZERO_API_URL, SUBZERO_AGENT_TOKEN: '<your sz_agent_ token>' },
          },
        },
      },
      null,
      2,
    ),
    hermes: `# ~/.hermes/config.yaml — then run /reload-mcp in Hermes (or restart it)
mcp_servers:
  subzero:
    command: "npx"
    args: ["-y", "@sub-zero/agent-mcp"]
    env:
      SUBZERO_API_URL: "${env.SUBZERO_API_URL}"
      SUBZERO_AGENT_TOKEN: "<your sz_agent_ token>"`,
    codex: `# ~/.codex/config.toml
[mcp_servers.subzero]
command = "npx"
args = ["-y", "@sub-zero/agent-mcp"]
env = { SUBZERO_API_URL = "${env.SUBZERO_API_URL}", SUBZERO_AGENT_TOKEN = "<your sz_agent_ token>" }`,
  };
  const prompt = `Use the subzero MCP tools. Call connection_status, then list_available for project ${demo.projectKey}.
For each ticket: take_ticket, read it with get_ticket, reproduce the failure locally (see DEMO.md),
fix the root cause in apps/api/src with a test that fails before your change and passes after,
then resolve_ticket with the cause, the fix, and how you proved it.
Do not modify apps/api/src/common/sub-zero.notifier.ts.`;
  const expires = new Date(demo.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <TopBar />
      <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <header className="mb-2">
          <h1 className="text-2xl font-bold">Your sandbox is live</h1>
          <p className="text-[var(--color-text-muted)]">
            SubZero project <strong>{demo.projectKey}</strong> · open until {expires}
          </p>
        </header>

        {credentials ? (
          <div className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-2 font-semibold">Save these now — they are only shown once.</p>
            <CopyBlock
              text={`Stacks (this app)   ${email}  /  ${credentials.trelloPassword}
SubZero dashboard   ${credentials.subzero.email}  /  ${credentials.subzero.password}`}
            />
          </div>
        ) : (
          <p className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
            Your passwords were shown once, when you signed up. Lost them? Email us and we&apos;ll
            reset your sandbox.
          </p>
        )}

        <Step n={1} title="Your workspace has already broken">
          <p>
            We used your new workspace the way a team does on day one — opened the boards, edited
            a card, started a checklist, filtered by due date. Five things crashed, and each crash
            filed its own incident in SubZero. Nobody typed a ticket.
          </p>
          <p>
            <Link href="/" className="font-semibold text-[var(--color-accent)]">
              Open your boards
            </Link>{' '}
            and click around — anything else that breaks lands in the same queue.
          </p>
        </Step>

        <Step n={2} title="See the incidents in SubZero">
          <p>
            Sign in at{' '}
            <a href={demo.dashboardUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--color-accent)]">
              {demo.dashboardUrl.replace(/^https?:\/\//, '')}
            </a>{' '}
            with the SubZero login above. Each incident has the route, the stack and the user who
            hit it.
          </p>
        </Step>

        <Step n={3} title="Create an agent credential">
          <p>
            In SubZero, open <strong>Agents</strong> and fill in the form: any name,
            integration <strong>Hermes</strong> if that is your agent, otherwise{' '}
            <strong>Custom agent</strong>, permissions <strong>Autonomous</strong>, tick{' '}
            <strong>Let this agent take unassigned tickets</strong>, and project{' '}
            <strong>{demo.projectKey}</strong>. Copy the <code>sz_agent_</code> credential it gives
            you — it is shown once.
          </p>
        </Step>

        <Step n={4} title="Get the code">
          <CopyBlock text={`git clone ${demo.repoUrl}\ncd ${repoDir}`} />
          <p>
            <code>DEMO.md</code> in the repo shows how to run it locally, so your agent can reproduce each fault.
          </p>
        </Step>

        <Step n={5} title="Connect your agent">
          <div className="flex gap-2">
            {(
              [
                ['claude', 'Claude Code'],
                ['hermes', 'Hermes'],
                ['cursor', 'Cursor / Windsurf / other MCP'],
                ['codex', 'Codex'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-[var(--radius-sm)] px-3 py-1 text-xs font-semibold ${
                  tab === key ? 'bg-[var(--color-accent)] text-white' : 'bg-black/5 hover:bg-black/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <CopyBlock text={snippets[tab]} />
        </Step>

        <Step n={6} title="Hand it the queue">
          <p>Run this in the cloned repo, then watch the tickets close in SubZero:</p>
          <CopyBlock text={prompt} />
        </Step>
      </main>
    </div>
  );
}

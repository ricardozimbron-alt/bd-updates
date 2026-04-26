'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { MD } from '@/lib/md';
import { applyAssistantProposalAction } from '@/app/api/assistant/proposals';

interface Proposal {
  type:
    | 'update_client_profile'
    | 'set_client_ownership'
    | 'add_relevance_rule'
    | 'dismiss_draft'
    | 'mark_draft_sent';
  summary: string;
  [k: string]: unknown;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: { name: string; summary: string }[];
  proposals?: Array<Proposal & { resolved?: 'approved' | 'rejected'; effect?: string; error?: string }>;
}

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const ctx = useMemo(() => {
    const route = pathname + (searchParams.size ? `?${searchParams.toString()}` : '');
    const selectedDraftId = searchParams.get('id') ?? undefined;
    let selectedClientId: string | undefined;
    const clientMatch = pathname.match(/^\/clients\/([^/]+)/);
    if (clientMatch) selectedClientId = clientMatch[1];
    return { route, selectedDraftId, selectedClientId };
  }, [pathname, searchParams]);

  useEffect(() => {
    if (open && taRef.current) taRef.current.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  // Cmd/Ctrl + / opens the assistant from any page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          context: ctx,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as {
        text: string;
        toolTrace?: Msg['toolTrace'];
        proposals?: Proposal[];
      };
      setMessages((cur) => [
        ...cur,
        {
          role: 'assistant',
          content: j.text,
          toolTrace: j.toolTrace,
          proposals: (j.proposals ?? []).map((p) => ({ ...p })),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-sky-700 bg-sky-700 px-4 py-2 text-sm text-white shadow-lg shadow-sky-950/50 hover:bg-sky-600"
        title="Assistant — Cmd/Ctrl + /"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
        <span>Ask</span>
        <span className="kbd ml-1 border-sky-500 bg-sky-800 text-sky-100">⌘/</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[70vh] w-[420px] flex-col rounded border border-ink-700 bg-ink-950 shadow-2xl">
          <header className="flex items-center justify-between border-b border-ink-800 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink-100">Assistant</span>
              <span className="text-ink-500">on {ctx.route}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-400 hover:text-ink-100"
              aria-label="Close"
            >
              ✕
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
            {messages.length === 0 && (
              <div className="space-y-2 text-xs text-ink-400">
                <p>Ask anything about the app. The assistant can:</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>Explain why a draft was generated for a given client.</li>
                  <li>Take feedback and either tighten a rule or amend the client profile.</li>
                  <li>Flip a client between direct and relationship-partner-led.</li>
                  <li>Search the web for context on parties or sectors.</li>
                  <li>Dismiss or send drafts on your behalf.</li>
                </ul>
                <p className="pt-2 text-ink-500">
                  Try: "Why was the eBay/Depop draft created for Acme?" or "Add a global rule
                  excluding state-aid renewable subsidies unless a watched party is named."
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="mb-3">
                <div
                  className={
                    'rounded px-2 py-1.5 ' +
                    (m.role === 'user'
                      ? 'whitespace-pre-wrap bg-sky-900/30 text-ink-100'
                      : 'bg-ink-900/40 text-ink-200')
                  }
                >
                  <div className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-500">
                    {m.role}
                  </div>
                  {m.role === 'assistant' ? <MD text={m.content} /> : m.content}
                </div>
                {m.proposals && m.proposals.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {m.proposals.map((p, j) => (
                      <ProposalCard
                        key={j}
                        proposal={p}
                        onResolve={(resolution, effect, error) => {
                          setMessages((cur) =>
                            cur.map((mm, mi) =>
                              mi !== i || !mm.proposals
                                ? mm
                                : {
                                    ...mm,
                                    proposals: mm.proposals.map((pp, pj) =>
                                      pj === j
                                        ? { ...pp, resolved: resolution, effect, error }
                                        : pp,
                                    ),
                                  },
                            ),
                          );
                          if (resolution === 'approved') router.refresh();
                        }}
                      />
                    ))}
                  </ul>
                )}
                {m.toolTrace && m.toolTrace.length > 0 && (
                  <details className="mt-1 text-[10px] text-ink-500">
                    <summary className="cursor-pointer hover:text-ink-300">
                      {m.toolTrace.length} tool call{m.toolTrace.length > 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3 font-mono">
                      {m.toolTrace.map((t, j) => (
                        <li key={j}>{t.summary}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
            {busy && <div className="text-xs text-ink-500">thinking…</div>}
            {error && (
              <div className="rounded border border-rose-700 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-ink-800 p-2"
          >
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask, give feedback, or describe a change…"
              rows={3}
              className="textarea text-sm"
              disabled={busy}
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-ink-500">
              <span>Enter to send · Shift+Enter for newline</span>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="btn btn-primary px-3 py-1 text-xs"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function ProposalCard({
  proposal,
  onResolve,
}: {
  proposal: Proposal & { resolved?: 'approved' | 'rejected'; effect?: string; error?: string };
  onResolve: (
    resolution: 'approved' | 'rejected',
    effect?: string,
    error?: string,
  ) => void;
}) {
  const [busy, setBusy] = useState(false);

  const ICON: Record<Proposal['type'], string> = {
    update_client_profile: '✎',
    set_client_ownership: '⇄',
    add_relevance_rule: '+',
    dismiss_draft: '✕',
    mark_draft_sent: '✉',
  };
  const COLOR: Record<Proposal['type'], string> = {
    update_client_profile: 'border-sky-700 bg-sky-900/30',
    set_client_ownership: 'border-sky-700 bg-sky-900/30',
    add_relevance_rule: 'border-emerald-700 bg-emerald-900/20',
    dismiss_draft: 'border-rose-700 bg-rose-900/20',
    mark_draft_sent: 'border-amber-700 bg-amber-900/30',
  };
  const LABEL: Record<Proposal['type'], string> = {
    update_client_profile: 'Edit profile',
    set_client_ownership: 'Change ownership',
    add_relevance_rule: 'Add rule (as candidate)',
    dismiss_draft: 'Dismiss draft',
    mark_draft_sent: 'Mark sent (irreversible)',
  };

  if (proposal.resolved === 'approved') {
    return (
      <li className="rounded border border-emerald-800 bg-emerald-900/20 px-2 py-1.5 text-[11px] text-emerald-200">
        ✓ Approved — {proposal.effect ?? LABEL[proposal.type]}
      </li>
    );
  }
  if (proposal.resolved === 'rejected') {
    return (
      <li className="rounded border border-ink-700 bg-ink-900/40 px-2 py-1.5 text-[11px] text-ink-400">
        ✗ Rejected — {LABEL[proposal.type]} ({proposal.summary})
      </li>
    );
  }

  return (
    <li className={'rounded border px-2 py-2 text-[12px] ' + COLOR[proposal.type]}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-base leading-none">{ICON[proposal.type]}</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-300">
          {LABEL[proposal.type]}
        </span>
      </div>
      <p className="mb-2 text-ink-100">{proposal.summary}</p>
      <ProposalDetails proposal={proposal} />
      {proposal.error && (
        <p className="mb-1 text-[10px] text-rose-300">{proposal.error}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await applyAssistantProposalAction(JSON.stringify(proposal));
              onResolve('approved', r.effect);
            } catch (err) {
              onResolve('rejected', undefined, err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
          className="rounded border border-emerald-700 bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('rejected')}
          className="rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-800"
        >
          Reject
        </button>
      </div>
    </li>
  );
}

function ProposalDetails({ proposal }: { proposal: Proposal }) {
  const p = proposal as Record<string, unknown> & { type: Proposal['type'] };
  switch (p.type) {
    case 'update_client_profile':
      return (
        <details className="text-[11px] text-ink-300">
          <summary className="cursor-pointer text-ink-400">show new profile narrative</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink-950 p-2 font-mono">
            {String(p.narrativeMarkdown ?? '')}
          </pre>
        </details>
      );
    case 'add_relevance_rule':
      return (
        <p className="text-[11px] italic text-ink-300">
          [{String(p.scope)}] "{String(p.rule)}"
        </p>
      );
    case 'set_client_ownership':
      return (
        <p className="text-[11px] text-ink-300">
          → mode: <span className="font-mono">{String(p.mode)}</span>
          {p.partnerName ? ` · ${String(p.partnerName)}` : ''}
          {p.partnerEmail ? ` <${String(p.partnerEmail)}>` : ''}
        </p>
      );
    case 'dismiss_draft':
      return (
        <p className="text-[11px] text-ink-300">
          {p.freeText ? `"${String(p.freeText)}"` : ''}
        </p>
      );
    case 'mark_draft_sent':
      return null;
    default:
      return null;
  }
}

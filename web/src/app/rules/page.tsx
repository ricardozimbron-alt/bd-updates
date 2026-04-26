import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import {
  addRuleAction,
  approveCandidateRuleAction,
  deleteRuleAction,
  rejectCandidateRuleAction,
  toggleRuleAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  await requireOwner();
  const allRules = await prisma.clientRelevanceRule.findMany({
    orderBy: [{ status: 'asc' }, { scope: 'asc' }, { createdAt: 'desc' }],
    include: { client: { select: { displayName: true } } },
  });
  const candidates = allRules.filter((r) => r.status === 'candidate');
  const live = allRules.filter((r) => r.status === 'active');
  const rejected = allRules.filter((r) => r.status === 'rejected');

  const clients = await prisma.client.findMany({
    where: { archived: false },
    orderBy: { name: 'asc' },
    select: { id: true, displayName: true },
  });

  return (
    <AppShell active="rules">
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <h1 className="mb-2 text-lg font-semibold">Relevance rules</h1>
        <p className="mb-4 text-xs text-ink-400">
          Rules are appended to the relevance prompt. Global rules apply to all clients;
          client rules only to that client. Only <span className="text-emerald-400">active</span>{' '}
          rules are consulted by the relevance engine — assistant-proposed rules land as{' '}
          <span className="text-amber-400">candidates</span> and require your explicit
          promotion below.
        </p>

        {candidates.length > 0 && (
          <section className="mb-6 rounded border border-amber-700 bg-amber-900/10 p-3">
            <h2 className="mb-2 text-sm font-semibold text-amber-300">
              Candidate rules awaiting your review ({candidates.length})
            </h2>
            <ul className="space-y-2">
              {candidates.map((r) => (
                <li
                  key={r.id}
                  className="rounded border border-ink-800 bg-ink-900/40 px-3 py-2 text-sm"
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-400">
                    <span className="rounded bg-ink-800 px-1.5 py-0.5">
                      {r.scope}
                      {r.client?.displayName ? ` · ${r.client.displayName}` : ''}
                    </span>
                    <span>from {r.source}</span>
                    <span className="text-ink-500">
                      proposed {r.proposedAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="mb-2 text-ink-200">{r.rule}</p>
                  <div className="flex gap-2">
                    <form action={approveCandidateRuleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded border border-emerald-700 bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-600"
                      >
                        Approve & activate
                      </button>
                    </form>
                    <form action={rejectCandidateRuleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-800"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="mb-2 text-sm font-semibold">Active</h2>
        <table className="mb-6 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">Scope</th>
              <th className="px-2 py-2">Rule</th>
              <th className="px-2 py-2">Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {live.map((r) => (
              <tr key={r.id} className="border-t border-ink-800 align-top">
                <td className="px-2 py-2 text-xs text-ink-300">
                  {r.scope}
                  {r.client?.displayName ? ` · ${r.client.displayName}` : ''}
                </td>
                <td className="px-2 py-2 text-xs">{r.rule}</td>
                <td className="px-2 py-2 text-xs">
                  <form action={toggleRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      className={
                        'rounded border px-2 py-0.5 text-[11px] ' +
                        (r.active
                          ? 'border-emerald-700 text-emerald-400'
                          : 'border-ink-700 text-ink-500')
                      }
                      type="submit"
                    >
                      {r.active ? 'on' : 'off'}
                    </button>
                  </form>
                </td>
                <td className="px-2 py-2 text-right">
                  <form action={deleteRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-rose-400 hover:underline" type="submit">
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {live.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-ink-500">
                  No active rules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {rejected.length > 0 && (
          <details className="mb-6 text-xs text-ink-400">
            <summary className="cursor-pointer hover:text-ink-200">
              Rejected ({rejected.length}) — kept for audit
            </summary>
            <ul className="mt-2 space-y-1 pl-3">
              {rejected.map((r) => (
                <li key={r.id} className="line-through opacity-70">
                  [{r.scope}] {r.rule}
                </li>
              ))}
            </ul>
          </details>
        )}

        <h2 className="mb-2 text-sm font-semibold">Add rule</h2>
        <form action={addRuleAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label mb-1 block">Scope</span>
              <select className="input" name="scope" defaultValue="global">
                <option value="global">Global</option>
                <option value="client">Client</option>
              </select>
            </label>
            <label className="block">
              <span className="label mb-1 block">Client (if scope = client)</span>
              <select className="input" name="clientId" defaultValue="">
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label mb-1 block">Rule</span>
            <textarea className="textarea" name="rule" rows={3} required />
          </label>
          <button className="btn btn-primary" type="submit">Add rule</button>
        </form>
      </div>
    </AppShell>
  );
}

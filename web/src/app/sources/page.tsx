import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { relativeTime } from '@/lib/format';
import { pollNowAction } from '@/app/inbox/actions';

export const dynamic = 'force-dynamic';

const KNOWN_SOURCES = [
  { id: 'cma-atom', label: 'CMA cases (gov.uk Atom)' },
  { id: 'ec-press', label: 'EC Press Corner (DG COMP)' },
  { id: 'ec-case-search', label: 'EC merger case search' },
];

export default async function SourcesPage() {
  await requireOwner();
  const rows = await prisma.sourceHealth.findMany();
  const byId = new Map(rows.map((r) => [r.sourceId, r]));

  const eventCounts = await prisma.event.groupBy({
    by: ['authority'],
    _count: { authority: true },
  });

  return (
    <AppShell active="sources">
      <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
        <h1 className="mb-4 text-lg font-semibold">Source health</h1>
        <table className="mb-8 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Last success</th>
              <th className="px-2 py-2">Last failure</th>
              <th className="px-2 py-2">Streak</th>
              <th className="px-2 py-2">Note / error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {KNOWN_SOURCES.map((s) => {
              const r = byId.get(s.id);
              const okStreak = (r?.consecutiveFailures ?? 0) === 0;
              return (
                <tr key={s.id} className="border-t border-ink-800 align-top">
                  <td className="px-2 py-2">
                    <span
                      className={
                        'mr-2 inline-block h-2 w-2 rounded-full ' +
                        (okStreak && r?.lastSuccessAt
                          ? 'bg-emerald-400'
                          : 'bg-rose-400')
                      }
                    />
                    {r?.label ?? s.label}
                    <div className="text-[11px] text-ink-500">{s.id}</div>
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-300">
                    {r?.lastSuccessAt ? relativeTime(r.lastSuccessAt) + ' ago' : 'never'}
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-300">
                    {r?.lastFailureAt ? relativeTime(r.lastFailureAt) + ' ago' : 'never'}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {r?.consecutiveFailures ? (
                      <span className="text-rose-400">{r.consecutiveFailures} fail</span>
                    ) : (
                      <span className="text-emerald-400">ok</span>
                    )}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] text-ink-300">
                    {r?.lastError || r?.lastNote || ''}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <form action={pollNowAction}>
                      <input type="hidden" name="source" value={s.id} />
                      <button className="text-xs text-sky-400 hover:underline" type="submit">
                        poll now
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2 className="mb-2 text-sm font-semibold">Events captured by authority</h2>
        <table className="w-full text-sm">
          <tbody>
            {eventCounts.map((row) => (
              <tr key={row.authority} className="border-t border-ink-800">
                <td className="px-2 py-2">{row.authority}</td>
                <td className="px-2 py-2 text-xs text-ink-300">{row._count.authority}</td>
              </tr>
            ))}
            {eventCounts.length === 0 && (
              <tr>
                <td className="px-2 py-2 text-xs text-ink-500">No events yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

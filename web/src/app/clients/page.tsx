import Link from 'next/link';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { quickToggleOwnershipAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  await requireOwner();
  const clients = await prisma.client.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { drafts: true, contacts: true, entities: true } } },
  });
  return (
    <AppShell active="clients">
      <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Clients</h1>
          <Link className="btn btn-primary" href="/clients/new">
            New client
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">Display name</th>
              <th className="px-2 py-2">Ownership</th>
              <th className="px-2 py-2">Sectors</th>
              <th className="px-2 py-2">Geographies</th>
              <th className="px-2 py-2">Threshold</th>
              <th className="px-2 py-2"># drafts</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-ink-800 hover:bg-ink-900">
                <td className="px-2 py-2">
                  <Link className="text-sky-400 hover:underline" href={`/clients/${c.id}`}>
                    {c.displayName}
                  </Link>
                  <div className="text-[11px] text-ink-500">{c.name}</div>
                </td>
                <td className="px-2 py-2 text-xs">
                  <form action={quickToggleOwnershipAction} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className={
                        'rounded px-1.5 py-0.5 text-[11px] ' +
                        (c.ownershipMode === 'relationship_partner'
                          ? 'border border-amber-700 bg-amber-900/40 text-amber-200 hover:bg-amber-900/60'
                          : 'border border-ink-700 text-ink-300 hover:bg-ink-800')
                      }
                      title="Click to toggle ownership"
                    >
                      {c.ownershipMode === 'relationship_partner'
                        ? `via ${c.relationshipPartnerName ?? 'partner'}`
                        : 'direct'}
                    </button>
                  </form>
                </td>
                <td className="px-2 py-2 text-xs text-ink-300">
                  {c.sectorTags.slice(0, 5).join(', ') || '—'}
                </td>
                <td className="px-2 py-2 text-xs text-ink-300">
                  {c.geographies.join(', ') || '—'}
                </td>
                <td className="px-2 py-2 text-xs text-ink-300">{c.confidenceThreshold}</td>
                <td className="px-2 py-2 text-xs text-ink-300">{c._count.drafts}</td>
                <td className="px-2 py-2 text-xs">
                  {c.archived ? (
                    <span className="text-ink-500">archived</span>
                  ) : (
                    <span className="text-emerald-400">active</span>
                  )}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-ink-500">
                  No clients yet. <Link className="text-sky-400 hover:underline" href="/clients/new">Add the first one →</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

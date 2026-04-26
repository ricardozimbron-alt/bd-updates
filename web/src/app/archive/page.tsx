import Link from 'next/link';
import { prisma } from '@bdu/lib';
import type { Prisma } from '@bdu/lib/prisma';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { eventTypeLabel, relativeTime, tierClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    authority?: string;
    eventType?: string;
    status?: string;
    q?: string;
  }>;
}) {
  await requireOwner();
  const sp = await searchParams;

  const where: Prisma.DraftWhereInput = {};
  if (sp.client) where.clientId = sp.client;
  if (sp.authority) where.event = { authority: sp.authority as 'CMA' | 'EC' | 'OTHER' };
  if (sp.eventType) {
    where.event = { ...(where.event ?? {}), eventType: sp.eventType as never };
  }
  if (sp.status) where.status = sp.status as 'pending' | 'sent' | 'dismissed';
  if (sp.q) {
    where.OR = [
      { subject: { contains: sp.q, mode: 'insensitive' } },
      { body: { contains: sp.q, mode: 'insensitive' } },
      { event: { title: { contains: sp.q, mode: 'insensitive' } } },
    ];
  }

  const drafts = await prisma.draft.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { client: true, event: true, judgment: true },
  });

  const clients = await prisma.client.findMany({
    orderBy: { displayName: 'asc' },
    select: { id: true, displayName: true },
  });

  return (
    <AppShell active="archive">
      <div className="mx-auto h-full max-w-6xl overflow-y-auto p-6">
        <h1 className="mb-4 text-lg font-semibold">Archive</h1>
        <form className="mb-4 grid grid-cols-5 gap-2" method="get">
          <select className="input" name="client" defaultValue={sp.client ?? ''}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          <select className="input" name="authority" defaultValue={sp.authority ?? ''}>
            <option value="">All authorities</option>
            <option>CMA</option>
            <option>EC</option>
            <option>OTHER</option>
          </select>
          <input
            className="input"
            name="eventType"
            defaultValue={sp.eventType ?? ''}
            placeholder="event type (e.g. CMA_PHASE1_DECISION)"
          />
          <select className="input" name="status" defaultValue={sp.status ?? ''}>
            <option value="">Any status</option>
            <option>pending</option>
            <option>sent</option>
            <option>dismissed</option>
          </select>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              name="q"
              defaultValue={sp.q ?? ''}
              placeholder="search subject/body/title"
            />
            <button className="btn" type="submit">Filter</button>
          </div>
        </form>

        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Client</th>
              <th className="px-2 py-2">Event</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Tier</th>
              <th className="px-2 py-2">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id} className="border-t border-ink-800 hover:bg-ink-900">
                <td className="px-2 py-2 text-xs text-ink-300">
                  {relativeTime(d.createdAt)}
                </td>
                <td className="px-2 py-2">{d.client.displayName}</td>
                <td className="px-2 py-2">
                  <a className="text-sky-400 hover:underline" href={d.event.sourceUrl} target="_blank" rel="noreferrer">
                    {d.event.title}
                  </a>
                </td>
                <td className="px-2 py-2 text-xs">{eventTypeLabel(d.event.eventType)}</td>
                <td className={'px-2 py-2 text-xs ' + tierClass(d.judgment.tier)}>
                  {d.judgment.tier} · {d.judgment.confidence}
                </td>
                <td className="px-2 py-2 text-xs text-ink-300">{d.status}</td>
                <td className="px-2 py-2 text-right">
                  <Link className="text-xs text-sky-400 hover:underline" href={`/inbox?id=${d.id}`}>
                    open
                  </Link>
                </td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-ink-500">
                  No drafts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

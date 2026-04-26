import Link from 'next/link';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { eventTypeLabel, relativeTime, tierClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  await requireOwner();

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since1d = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    pendingCount,
    sentCount,
    eventsToday,
    events7d,
    judgments7d,
    sources,
    latestHigh,
    latestEvents,
  ] = await Promise.all([
    prisma.draft.count({ where: { status: 'pending' } }),
    prisma.draft.count({ where: { status: 'sent' } }),
    prisma.event.count({ where: { detectedAt: { gte: since1d } } }),
    prisma.event.count({ where: { detectedAt: { gte: since7d } } }),
    prisma.relevanceJudgment.count({ where: { processedAt: { gte: since7d } } }),
    prisma.sourceHealth.findMany(),
    prisma.draft.findMany({
      where: { status: 'pending', judgment: { tier: 'high' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { client: true, event: true, judgment: true },
    }),
    prisma.event.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 8,
      select: { id: true, title: true, eventType: true, authority: true, detectedAt: true },
    }),
  ]);

  // 7-day events-per-day buckets for a tiny sparkline.
  const buckets: number[] = new Array(7).fill(0);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const allDetected = await prisma.event.findMany({
    where: { detectedAt: { gte: since7d } },
    select: { detectedAt: true },
  });
  for (const e of allDetected) {
    const daysAgo = Math.floor(
      (todayMidnight.getTime() - new Date(e.detectedAt).setHours(0, 0, 0, 0)) / 86_400_000,
    );
    if (daysAgo >= 0 && daysAgo < 7) buckets[6 - daysAgo]!++;
  }
  const maxBucket = Math.max(1, ...buckets);

  return (
    <AppShell active="inbox">
      <div className="mx-auto h-full max-w-6xl overflow-y-auto p-6">
        <h1 className="mb-1 text-xl font-semibold">Today</h1>
        <p className="mb-6 text-xs text-ink-400">
          {eventsToday} events detected in the last 24h · {events7d} in 7d ·{' '}
          {judgments7d} relevance judgments run.
        </p>

        <div className="grid grid-cols-4 gap-3">
          <Stat label="Pending drafts" value={pendingCount} href="/inbox" accent="amber" />
          <Stat label="Sent (all time)" value={sentCount} href="/archive?status=sent" />
          <Stat
            label="Sources healthy"
            value={`${sources.filter((s) => s.consecutiveFailures === 0 && s.lastSuccessAt).length}/${sources.length || 1}`}
            href="/sources"
          />
          <Stat label="Events today" value={eventsToday} />
        </div>

        <div className="mt-6 rounded border border-ink-800 p-3">
          <p className="label mb-2">Events / day (last 7)</p>
          <div className="flex items-end gap-1.5 h-16">
            {buckets.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm bg-sky-700"
                  style={{ height: `${(v / maxBucket) * 100}%`, minHeight: '2px' }}
                  title={`${v} events`}
                />
                <span className="text-[10px] text-ink-500">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <section className="rounded border border-ink-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Latest high-tier drafts</p>
              <Link className="text-xs text-sky-400 hover:underline" href="/inbox">
                inbox →
              </Link>
            </div>
            <ul className="space-y-2">
              {latestHigh.map((d) => (
                <li key={d.id} className="text-sm">
                  <Link className="hover:underline" href={`/inbox?id=${d.id}`}>
                    <span className="font-medium">{d.client.displayName}</span>
                    <span className="text-ink-500"> — </span>
                    <span className="text-ink-300">{d.event.title}</span>
                  </Link>
                  <div className={'mt-0.5 text-[11px] ' + tierClass(d.judgment.tier)}>
                    {d.judgment.tier} · {d.judgment.confidence} ·{' '}
                    {relativeTime(d.createdAt)}
                  </div>
                </li>
              ))}
              {latestHigh.length === 0 && (
                <li className="text-xs text-ink-500">No pending high-tier drafts.</li>
              )}
            </ul>
          </section>

          <section className="rounded border border-ink-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Latest events</p>
              <Link className="text-xs text-sky-400 hover:underline" href="/sources">
                sources →
              </Link>
            </div>
            <ul className="space-y-1.5">
              {latestEvents.map((e) => (
                <li key={e.id} className="text-xs">
                  <span className="text-ink-500">{relativeTime(e.detectedAt)}</span>{' '}
                  <span className="rounded bg-ink-800 px-1 py-0.5 text-[10px] text-ink-300">
                    {e.authority}
                  </span>{' '}
                  <span className="text-ink-300">{eventTypeLabel(e.eventType)}</span>
                  <div className="text-ink-200">{e.title}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: 'amber' | 'green';
}) {
  const cls =
    'rounded border p-3 ' +
    (accent === 'amber'
      ? 'border-amber-800 bg-amber-900/20'
      : accent === 'green'
        ? 'border-emerald-800 bg-emerald-900/20'
        : 'border-ink-800 bg-ink-900/20');
  const inner = (
    <div className={cls + (href ? ' hover:bg-ink-900/40' : '')}>
      <p className="text-[10px] uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

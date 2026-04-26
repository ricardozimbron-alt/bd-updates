import { redirect } from 'next/navigation';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { DraftDetail } from '@/components/DraftDetail';
import { InboxKeyboard } from '@/components/InboxKeyboard';
import { InboxList } from '@/components/InboxList';

export const dynamic = 'force-dynamic';

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireOwner();
  const sp = await searchParams;

  // Default surface = pending high + pending medium. Order high first, then
  // newest. Low tier is logged but never drafted, so won't appear here.
  const draftsRaw = await prisma.draft.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      client: true,
      event: true,
      judgment: true,
    },
  });
  const drafts = [
    ...draftsRaw.filter((d) => d.judgment.tier === 'high'),
    ...draftsRaw.filter((d) => d.judgment.tier === 'medium'),
    ...draftsRaw.filter(
      (d) => d.judgment.tier !== 'high' && d.judgment.tier !== 'medium',
    ),
  ];

  if (drafts.length === 0) {
    return (
      <AppShell active="inbox">
        <div className="flex h-full items-center justify-center text-ink-400">
          <div className="space-y-2 text-center">
            <p>No pending drafts.</p>
            <p className="text-xs">
              The worker writes drafts here as new high- and medium-tier matches arrive.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const selectedId = sp.id ?? drafts[0]!.id;
  const selected = drafts.find((d) => d.id === selectedId);
  if (!selected) {
    redirect(`/inbox?id=${drafts[0]!.id}`);
  }

  return (
    <AppShell active="inbox">
      <InboxKeyboard ids={drafts.map((d) => d.id)} selectedId={selectedId} />
      <div className="flex h-full">
        <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-ink-800">
          <InboxList
            drafts={drafts.map((d) => ({
              id: d.id,
              createdAt: d.createdAt.toISOString(),
              client: { id: d.client.id, displayName: d.client.displayName },
              event: { title: d.event.title, eventType: d.event.eventType },
              judgment: { tier: d.judgment.tier, confidence: d.judgment.confidence },
            }))}
            selectedId={selectedId}
          />
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto">
          {selected && <DraftDetail draftId={selected.id} />}
        </section>
      </div>
    </AppShell>
  );
}

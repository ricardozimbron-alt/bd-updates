import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { lineDiff } from '@/lib/diff';

export const dynamic = 'force-dynamic';

export default async function DraftHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { editedAt: 'asc' } },
      client: true,
      event: true,
    },
  });
  if (!draft) return notFound();

  const versions = draft.versions;
  const pairs: Array<{
    fromIdx: number | null;
    toIdx: number;
    from?: { subject: string; body: string };
    to: { subject: string; body: string; editedAt: Date; editedBy: string };
  }> = [];
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i]!;
    pairs.push({
      fromIdx: i === 0 ? null : i - 1,
      toIdx: i,
      from: i === 0 ? undefined : { subject: versions[i - 1]!.subject, body: versions[i - 1]!.body },
      to: { subject: v.subject, body: v.body, editedAt: v.editedAt, editedBy: v.editedBy },
    });
  }

  return (
    <AppShell active="inbox">
      <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
        <Link href={`/inbox?id=${draft.id}`} className="text-xs text-sky-400 hover:underline">
          ← back to draft
        </Link>
        <h1 className="mb-1 mt-1 text-lg font-semibold">
          Version history — {draft.client.displayName}
        </h1>
        <p className="mb-6 text-xs text-ink-400">{draft.event.title}</p>

        <ol className="space-y-6">
          {pairs.map((p) => {
            const subjectChanged = p.from && p.from.subject !== p.to.subject;
            const ops = p.from ? lineDiff(p.from.body, p.to.body) : [];
            return (
              <li
                key={p.toIdx}
                className="rounded border border-ink-800 bg-ink-900/30 p-3 text-sm"
              >
                <div className="mb-2 flex items-center gap-3 text-[11px] text-ink-400">
                  <span className="font-mono">v{p.toIdx + 1}</span>
                  <span>by {p.to.editedBy}</span>
                  <span>{p.to.editedAt.toISOString().replace('T', ' ').slice(0, 19)}</span>
                </div>
                {subjectChanged && (
                  <p className="mb-2 text-xs">
                    <span className="text-ink-500">subject: </span>
                    <span className="text-rose-300 line-through">{p.from!.subject}</span>{' '}
                    →{' '}
                    <span className="text-emerald-300">{p.to.subject}</span>
                  </p>
                )}
                {!p.from ? (
                  <pre className="whitespace-pre-wrap rounded bg-ink-950 p-2 font-mono text-[12px] text-ink-200">
                    {p.to.body}
                  </pre>
                ) : (
                  <pre className="whitespace-pre-wrap rounded bg-ink-950 p-2 font-mono text-[12px] leading-relaxed">
                    {ops.map((op, j) => (
                      <span
                        key={j}
                        className={
                          op.op === 'add'
                            ? 'block bg-emerald-900/30 text-emerald-200'
                            : op.op === 'remove'
                              ? 'block bg-rose-900/30 text-rose-200 line-through'
                              : 'block text-ink-300'
                        }
                      >
                        {op.op === 'add' ? '+ ' : op.op === 'remove' ? '- ' : '  '}
                        {op.text || ' '}
                      </span>
                    ))}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </AppShell>
  );
}

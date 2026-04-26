import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { addInteractionAction, deleteInteractionAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function InteractionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const c = await prisma.client.findUnique({
    where: { id },
    include: { interactions: { orderBy: { year: 'desc' } } },
  });
  if (!c) return notFound();
  return (
    <AppShell active="clients">
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <Link href={`/clients/${c.id}`} className="text-xs text-sky-400 hover:underline">
          ← {c.displayName}
        </Link>
        <h1 className="mb-4 mt-1 text-lg font-semibold">Prior authority interactions</h1>
        <table className="mb-6 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">Authority</th>
              <th className="px-2 py-2">Case ref</th>
              <th className="px-2 py-2">Year</th>
              <th className="px-2 py-2">Summary</th>
              <th className="px-2 py-2">In prompt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.interactions.map((i) => (
              <tr key={i.id} className="border-t border-ink-800">
                <td className="px-2 py-2 text-xs">{i.authority}</td>
                <td className="px-2 py-2 text-xs">{i.caseRef ?? ''}</td>
                <td className="px-2 py-2 text-xs">{i.year ?? ''}</td>
                <td className="px-2 py-2 text-xs text-ink-300">{i.summary}</td>
                <td className="px-2 py-2 text-xs">{i.surfaceInPrompt ? 'yes' : ''}</td>
                <td className="px-2 py-2">
                  <form action={deleteInteractionAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="clientId" value={c.id} />
                    <button className="text-xs text-rose-400 hover:underline" type="submit">
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {c.interactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-ink-500">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mb-2 text-sm font-semibold">Add interaction</h2>
        <form action={addInteractionAction} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="clientId" value={c.id} />
          <label className="block">
            <span className="label mb-1 block">Authority</span>
            <input className="input" name="authority" defaultValue="CMA" />
          </label>
          <label className="block">
            <span className="label mb-1 block">Case ref</span>
            <input className="input" name="caseRef" />
          </label>
          <label className="block">
            <span className="label mb-1 block">Year</span>
            <input className="input" name="year" type="number" />
          </label>
          <label className="inline-flex items-center gap-2 self-end pb-2 text-xs">
            <input
              type="checkbox"
              name="surfaceInPrompt"
              defaultChecked
              className="accent-sky-500"
            />
            Surface in prompt
          </label>
          <label className="col-span-2 block">
            <span className="label mb-1 block">Summary</span>
            <textarea className="textarea" name="summary" rows={3} required />
          </label>
          <div className="col-span-2">
            <button className="btn btn-primary" type="submit">Add</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { addEntityAction, deleteEntityAction } from '../../actions';

const KINDS = [
  'competitor',
  'customer',
  'supplier',
  'portfolio_company',
  'watched_theme',
  'watched_phrase',
];

export const dynamic = 'force-dynamic';

export default async function EntitiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const c = await prisma.client.findUnique({
    where: { id },
    include: { entities: { orderBy: [{ kind: 'asc' }, { value: 'asc' }] } },
  });
  if (!c) return notFound();
  return (
    <AppShell active="clients">
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <Link href={`/clients/${c.id}`} className="text-xs text-sky-400 hover:underline">
          ← {c.displayName}
        </Link>
        <h1 className="mb-4 mt-1 text-lg font-semibold">Watchlist entities</h1>
        <p className="mb-3 text-xs text-ink-400">
          The relevance Pass 1 screen looks for these strings in event parties / sectors
          / full text. Use named entities (companies, brands), themes, and phrases.
        </p>
        <table className="mb-6 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">Kind</th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.entities.map((e) => (
              <tr key={e.id} className="border-t border-ink-800">
                <td className="px-2 py-2 text-xs text-ink-300">{e.kind}</td>
                <td className="px-2 py-2">{e.value}</td>
                <td className="px-2 py-2 text-xs text-ink-300">{e.notes ?? ''}</td>
                <td className="px-2 py-2">
                  <form action={deleteEntityAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="clientId" value={c.id} />
                    <button className="text-xs text-rose-400 hover:underline" type="submit">
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {c.entities.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-ink-500">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mb-2 text-sm font-semibold">Add entity</h2>
        <form action={addEntityAction} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="clientId" value={c.id} />
          <label className="block">
            <span className="label mb-1 block">Kind</span>
            <select className="input" name="kind">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">Value</span>
            <input className="input" name="value" required />
          </label>
          <label className="col-span-2 block">
            <span className="label mb-1 block">Notes</span>
            <input className="input" name="notes" />
          </label>
          <div className="col-span-2">
            <button className="btn btn-primary" type="submit">Add</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

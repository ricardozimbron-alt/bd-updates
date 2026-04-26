import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { addContactAction, deleteContactAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const c = await prisma.client.findUnique({
    where: { id },
    include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  });
  if (!c) return notFound();
  return (
    <AppShell active="clients">
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <Link href={`/clients/${c.id}`} className="text-xs text-sky-400 hover:underline">
          ← {c.displayName}
        </Link>
        <h1 className="mb-4 mt-1 text-lg font-semibold">Contacts</h1>
        <table className="mb-6 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Primary</th>
              <th className="px-2 py-2">Cc</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.contacts.map((x) => (
              <tr key={x.id} className="border-t border-ink-800">
                <td className="px-2 py-2">{x.name}</td>
                <td className="px-2 py-2 font-mono text-xs">{x.email}</td>
                <td className="px-2 py-2 text-xs text-ink-300">{x.role ?? ''}</td>
                <td className="px-2 py-2 text-xs">{x.isPrimary ? 'yes' : ''}</td>
                <td className="px-2 py-2 text-xs">{x.isCc ? 'yes' : ''}</td>
                <td className="px-2 py-2">
                  <form action={deleteContactAction}>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="clientId" value={c.id} />
                    <button className="text-xs text-rose-400 hover:underline" type="submit">
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {c.contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-ink-500">
                  No contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mb-2 text-sm font-semibold">Add contact</h2>
        <form action={addContactAction} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="clientId" value={c.id} />
          <label className="block">
            <span className="label mb-1 block">Name</span>
            <input className="input" name="name" required />
          </label>
          <label className="block">
            <span className="label mb-1 block">Email</span>
            <input className="input" name="email" type="email" required />
          </label>
          <label className="block">
            <span className="label mb-1 block">Role</span>
            <input className="input" name="role" />
          </label>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" name="isPrimary" className="accent-sky-500" /> Primary
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" name="isCc" className="accent-sky-500" /> Cc
            </label>
          </div>
          <div className="col-span-2">
            <button className="btn btn-primary" type="submit">Add</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { setProfileAction, updateClientAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ClientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      profile: true,
      _count: { select: { contacts: true, entities: true, interactions: true, drafts: true } },
    },
  });
  if (!c) return notFound();
  return (
    <AppShell active="clients">
      <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{c.displayName}</h1>
          <nav className="flex gap-2 text-sm">
            <Link className="btn" href={`/clients/${c.id}/contacts`}>
              Contacts ({c._count.contacts})
            </Link>
            <Link className="btn" href={`/clients/${c.id}/entities`}>
              Watchlist ({c._count.entities})
            </Link>
            <Link className="btn" href={`/clients/${c.id}/interactions`}>
              Prior interactions ({c._count.interactions})
            </Link>
          </nav>
        </div>

        <form action={updateClientAction} className="space-y-3">
          <input type="hidden" name="id" value={c.id} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label mb-1 block">Name (internal)</span>
              <input className="input" name="name" defaultValue={c.name} required />
            </label>
            <label className="block">
              <span className="label mb-1 block">Display name</span>
              <input className="input" name="displayName" defaultValue={c.displayName} required />
            </label>
            <label className="block">
              <span className="label mb-1 block">Sector tags</span>
              <input className="input" name="sectorTags" defaultValue={c.sectorTags.join(', ')} />
            </label>
            <label className="block">
              <span className="label mb-1 block">Geographies</span>
              <input className="input" name="geographies" defaultValue={c.geographies.join(', ')} />
            </label>
            <label className="block">
              <span className="label mb-1 block">Confidence threshold</span>
              <input
                className="input"
                name="confidenceThreshold"
                type="number"
                min={0}
                max={100}
                defaultValue={c.confidenceThreshold}
              />
            </label>
            <label className="block">
              <span className="label mb-1 block">Tone preference</span>
              <input className="input" name="tonePreference" defaultValue={c.tonePreference ?? ''} />
            </label>
          </div>
          <label className="block">
            <span className="label mb-1 block">Notes (internal)</span>
            <textarea className="textarea" name="notes" rows={3} defaultValue={c.notes ?? ''} />
          </label>
          <fieldset className="rounded border border-ink-800 p-3">
            <legend className="px-1 text-xs uppercase tracking-wider text-ink-400">
              Ownership
            </legend>
            <div className="space-y-2">
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ownershipMode"
                    value="mine"
                    defaultChecked={c.ownershipMode === 'mine'}
                    className="accent-sky-500"
                  />
                  <span>
                    <span className="font-medium">Mine</span>{' '}
                    <span className="text-ink-500">— I send the email directly to the client</span>
                  </span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ownershipMode"
                    value="relationship_partner"
                    defaultChecked={c.ownershipMode === 'relationship_partner'}
                    className="accent-sky-500"
                  />
                  <span>
                    <span className="font-medium">Relationship-partner-led</span>{' '}
                    <span className="text-ink-500">— email the partner with a draft for the client</span>
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="label mb-1 block">Partner name</span>
                  <input
                    className="input"
                    name="relationshipPartnerName"
                    defaultValue={c.relationshipPartnerName ?? ''}
                  />
                </label>
                <label className="block">
                  <span className="label mb-1 block">Partner email</span>
                  <input
                    className="input"
                    name="relationshipPartnerEmail"
                    type="email"
                    defaultValue={c.relationshipPartnerEmail ?? ''}
                  />
                </label>
                <label className="block">
                  <span className="label mb-1 block">Partner firm</span>
                  <input
                    className="input"
                    name="relationshipPartnerFirm"
                    defaultValue={c.relationshipPartnerFirm ?? ''}
                  />
                </label>
              </div>
            </div>
          </fieldset>

          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={c.archived}
              className="accent-sky-500"
            />
            Archive
          </label>
          <div>
            <button className="btn btn-primary" type="submit">Save</button>
          </div>
        </form>

        <hr className="my-8 border-ink-800" />
        <h2 className="mb-2 text-sm font-semibold">Profile narrative</h2>
        <p className="mb-3 text-xs text-ink-400">
          Markdown. This is what the relevance and drafting prompts read. Be specific.
        </p>
        <form action={setProfileAction} className="space-y-2">
          <input type="hidden" name="clientId" value={c.id} />
          <textarea
            className="textarea font-mono"
            name="narrativeMarkdown"
            rows={14}
            defaultValue={c.profile?.narrativeMarkdown ?? ''}
          />
          <button className="btn btn-primary" type="submit">Save profile</button>
        </form>
      </div>
    </AppShell>
  );
}

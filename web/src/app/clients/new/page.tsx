import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';
import { createClientAction, importClientFromMarkdownAction } from '../actions';

export default async function NewClientPage() {
  await requireOwner();
  return (
    <AppShell active="clients">
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <h1 className="mb-4 text-lg font-semibold">New client</h1>
        <form action={createClientAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label mb-1 block">Name (internal)</span>
              <input className="input" name="name" required />
            </label>
            <label className="block">
              <span className="label mb-1 block">Display name</span>
              <input className="input" name="displayName" required />
            </label>
            <label className="block">
              <span className="label mb-1 block">Sector tags (comma-separated)</span>
              <input className="input" name="sectorTags" placeholder="e-commerce, retail" />
            </label>
            <label className="block">
              <span className="label mb-1 block">Geographies</span>
              <input className="input" name="geographies" placeholder="UK, EU" />
            </label>
            <label className="block">
              <span className="label mb-1 block">Confidence threshold</span>
              <input
                className="input"
                name="confidenceThreshold"
                type="number"
                min={0}
                max={100}
                defaultValue={70}
              />
            </label>
            <label className="block">
              <span className="label mb-1 block">Tone preference</span>
              <input className="input" name="tonePreference" placeholder="practical, plain" />
            </label>
          </div>
          <label className="block">
            <span className="label mb-1 block">Notes (internal)</span>
            <textarea className="textarea" name="notes" rows={3} />
          </label>

          <fieldset className="rounded border border-ink-800 p-3">
            <legend className="px-1 text-xs uppercase tracking-wider text-ink-400">
              Ownership
            </legend>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="ownershipMode" value="mine" defaultChecked className="accent-sky-500" />
                  <span><span className="font-medium">Mine</span> <span className="text-ink-500">— I send to the client</span></span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="ownershipMode" value="relationship_partner" className="accent-sky-500" />
                  <span><span className="font-medium">Relationship-partner-led</span> <span className="text-ink-500">— email the partner</span></span>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="label mb-1 block">Partner name</span>
                  <input className="input" name="relationshipPartnerName" />
                </label>
                <label className="block">
                  <span className="label mb-1 block">Partner email</span>
                  <input className="input" name="relationshipPartnerEmail" type="email" />
                </label>
                <label className="block">
                  <span className="label mb-1 block">Partner firm</span>
                  <input className="input" name="relationshipPartnerFirm" />
                </label>
              </div>
            </div>
          </fieldset>

          <button className="btn btn-primary" type="submit">Create</button>
        </form>

        <hr className="my-8 border-ink-800" />
        <h2 className="mb-3 text-sm font-semibold">Or import from Markdown</h2>
        <p className="mb-3 text-xs text-ink-400">
          Paste a Markdown narrative. The first <span className="font-mono">#</span> heading is taken as the client name; the rest becomes the profile.
        </p>
        <form action={importClientFromMarkdownAction} className="space-y-3">
          <textarea className="textarea" name="markdown" rows={10} required placeholder="# Acme Industries plc&#10;&#10;…narrative…" />
          <button className="btn" type="submit">Import</button>
        </form>
      </div>
    </AppShell>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bulkDismissAction } from '@/app/inbox/actions';
import { eventTypeLabel, relativeTime, tierClass } from '@/lib/format';

interface DraftListItem {
  id: string;
  createdAt: string; // ISO
  client: { id: string; displayName: string };
  event: { title: string; eventType: string };
  judgment: { tier: 'high' | 'medium' | 'low'; confidence: number };
}

export function InboxList({
  drafts,
  selectedId,
}: {
  drafts: DraftListItem[];
  selectedId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function clear() {
    setSelected(new Set());
  }

  const selectedDrafts = drafts.filter((d) => selected.has(d.id));
  const sameClient =
    selectedDrafts.length > 0 &&
    selectedDrafts.every((d) => d.client.id === selectedDrafts[0]!.client.id);

  return (
    <>
      <ul>
        {drafts.map((d) => {
          const isSelected = d.id === selectedId;
          const isHigh = d.judgment.tier === 'high';
          const isChecked = selected.has(d.id);
          return (
            <li key={d.id} className={isChecked ? 'bg-sky-950/30' : ''}>
              <div
                className={
                  'flex items-start gap-2 border-b border-ink-800 px-3 py-3 transition-colors ' +
                  (isHigh ? 'border-l-2 border-l-emerald-500 ' : '') +
                  (isSelected ? 'bg-ink-900' : 'hover:bg-ink-900/50')
                }
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(d.id)}
                  className="mt-1 accent-sky-500"
                  aria-label="Select"
                />
                <Link href={`/inbox?id=${d.id}`} className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={
                          'truncate text-sm ' + (isHigh ? 'font-semibold text-ink-50' : 'font-medium')
                        }
                      >
                        {d.client.displayName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-400">
                        {d.event.title}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-ink-500">
                      {relativeTime(d.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-500">
                    <span className="rounded bg-ink-800 px-1 py-0.5 text-ink-300">
                      {eventTypeLabel(d.event.eventType)}
                    </span>
                    <span className={tierClass(d.judgment.tier)}>
                      {d.judgment.tier} · {d.judgment.confidence}
                    </span>
                  </div>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-ink-700 bg-ink-900 px-4 py-2 text-sm shadow-lg">
          <span className="text-ink-300">
            {selected.size} selected
            {sameClient && selectedDrafts.length > 0
              ? ` (${selectedDrafts[0]!.client.displayName})`
              : ''}
          </span>
          <button
            onClick={() => setOpen(true)}
            className="rounded bg-rose-700 px-2 py-1 text-xs text-white hover:bg-rose-600"
          >
            Dismiss…
          </button>
          <button onClick={clear} className="text-xs text-ink-400 hover:text-ink-100">
            clear
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded border border-ink-700 bg-ink-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Dismiss {selected.size} drafts</h3>
              <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-100">
                ✕
              </button>
            </div>
            <form
              action={async (fd) => {
                await bulkDismissAction(fd);
                clear();
                setOpen(false);
                router.refresh();
              }}
              className="space-y-3"
            >
              {selectedDrafts.map((d) => (
                <input key={d.id} type="hidden" name="ids" value={d.id} />
              ))}
              <label className="block">
                <span className="label mb-1 block">Why (free text)</span>
                <textarea name="reason" className="textarea" rows={2} required />
              </label>
              <fieldset className="rounded border border-ink-800 p-3">
                <legend className="px-1 text-xs uppercase tracking-wider text-ink-400">
                  Optional: also add a rule so this is filtered next time
                </legend>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="ruleScope" value="" defaultChecked /> No rule
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="ruleScope" value="client" disabled={!sameClient} />
                      Client-specific
                      {!sameClient && <span className="text-ink-500"> (mixed)</span>}
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name="ruleScope" value="global" /> Global
                    </label>
                  </div>
                  <textarea
                    name="ruleText"
                    rows={2}
                    className="textarea"
                    placeholder="Rule text (short, concrete)…"
                  />
                </div>
              </fieldset>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="btn">
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Dismiss {selected.size}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

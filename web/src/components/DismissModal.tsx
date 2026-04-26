'use client';

import { useState } from 'react';
import { dismissAction } from '@/app/inbox/actions';

const CATEGORIES = [
  'Too generic',
  'Peripheral relevance',
  'Wrong geography',
  'Already covered',
  'Relationship-sensitive',
  'Factual issue',
  'Too long',
  'Useful internally only',
];

export function DismissModal({ draftId }: { draftId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        Dismiss with reason
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded border border-ink-700 bg-ink-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Dismiss with reason</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-400 hover:text-ink-100"
              >
                ✕
              </button>
            </div>
            <form action={dismissAction} className="space-y-3">
              <input type="hidden" name="id" value={draftId} />
              <div>
                <p className="label mb-1">Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <label
                      key={c}
                      className="inline-flex items-center gap-1 rounded border border-ink-700 px-2 py-0.5 text-xs hover:bg-ink-800"
                    >
                      <input type="checkbox" name="categories" value={c} className="accent-sky-500" />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="label mb-1 block">Why (free text)</span>
                <textarea name="freeText" rows={3} className="textarea" />
              </label>
              <div className="flex gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" name="scopeClientSpecific" className="accent-sky-500" />
                  Client-specific
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" name="scopeCrossClient" className="accent-sky-500" />
                  Cross-client
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn">
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Dismiss
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

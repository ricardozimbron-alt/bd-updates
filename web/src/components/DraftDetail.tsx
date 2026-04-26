import { prisma } from '@bdu/lib';
import { MD } from '@/lib/md';
import { eventTypeLabel, tierClass } from '@/lib/format';
import {
  dismissAction,
  markSentAction,
  regenerateDraftAction,
  reprocessEventAction,
  saveDraftAction,
} from '@/app/inbox/actions';
import { CopyButton } from './CopyButton';
import { DismissModal } from './DismissModal';

export async function DraftDetail({ draftId }: { draftId: string }) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      event: true,
      client: true,
      judgment: true,
      versions: { orderBy: { editedAt: 'desc' }, take: 6 },
    },
  });
  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-400">
        <div className="text-center">
          <p className="mb-2">This draft is no longer in the inbox.</p>
          <a className="text-sky-400 hover:underline" href="/inbox">
            ← Back to inbox
          </a>
        </div>
      </div>
    );
  }
  const sourceClaims = (Array.isArray(draft.sourceClaims) ? draft.sourceClaims : []) as Array<{
    claim: string;
    basis?: 'source_publication' | 'client_profile' | 'authority_interaction' | 'inference';
    evidence?: string;
    sourceExcerpt?: string; // legacy field from older drafts
    sourceUrl?: string;
  }>;
  const groupedClaims: Record<string, typeof sourceClaims> = {
    source_publication: [],
    client_profile: [],
    authority_interaction: [],
    inference: [],
    other: [],
  };
  for (const c of sourceClaims) {
    const k = c.basis ?? 'other';
    (groupedClaims[k] ?? groupedClaims.other!).push(c);
  }

  const fullTextPreview = draft.event.fullText.slice(0, 1000);
  return (
    <div className="grid h-full grid-cols-2 gap-0">
      {/* SOURCE PANE */}
      <div className="overflow-y-auto border-r border-ink-800 p-4 text-sm">
        <div className="mb-3 text-[11px] text-ink-400">SOURCE</div>
        <h2 className="mb-1 text-base font-semibold leading-snug">
          {draft.event.title}
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
          <span className="rounded bg-ink-800 px-1.5 py-0.5 text-ink-300">
            {eventTypeLabel(draft.event.eventType)}
          </span>
          <span>{draft.event.publishedAt.toISOString().slice(0, 10)}</span>
          <a
            className="text-sky-400 hover:underline"
            href={draft.event.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            open ↗
          </a>
        </div>
        <p className="mb-3 text-ink-300">{draft.event.summary}</p>
        <pre className="whitespace-pre-wrap rounded border border-ink-800 bg-ink-900/60 p-3 font-mono text-[12px] leading-relaxed text-ink-200">
          {fullTextPreview}
          {draft.event.fullText.length > 1000 ? '\n\n[…truncated]' : ''}
        </pre>
        {draft.event.attachmentUrls.length > 0 && (
          <div className="mt-3">
            <p className="label mb-1">Attachments</p>
            <ul className="space-y-1 text-xs">
              {draft.event.attachmentUrls.map((u) => (
                <li key={u}>
                  <a className="text-sky-400 hover:underline" href={u} target="_blank" rel="noreferrer">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* DRAFT PANE */}
      <div className="overflow-y-auto p-4 text-sm">
        {/* Why I selected this client — internal-only, never copied/sent. */}
        <section className="mb-4 rounded border border-sky-800 bg-sky-950/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-sky-100">
              Why I selected {draft.client.displayName} for this update
            </h2>
            <span className="rounded border border-sky-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-300">
              internal · not sent
            </span>
          </div>
          {draft.whyThisClient ? (
            <div className="text-[13px] text-ink-200">
              <MD text={draft.whyThisClient} />
            </div>
          ) : (
            <p className="text-[12px] italic text-ink-400">
              No "why this client" narrative on this draft (created before the field was added).
              Use the Regenerate button below to backfill.
            </p>
          )}
          <div className="mt-3 border-t border-sky-900 pt-2 text-[11px] text-ink-400">
            <span className="mr-1">Source:</span>
            <a
              href={draft.event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 hover:underline"
            >
              {draft.event.title}
            </a>
            <span className="mt-0.5 block">
              Authority: <span className="text-ink-200">{draft.event.authority}</span>
              <span className="mx-1.5">·</span>
              Type: <span className="text-ink-200">{eventTypeLabel(draft.event.eventType)}</span>
              <span className="mx-1.5">·</span>
              Tier: <span className={tierClass(draft.judgment.tier)}>{draft.judgment.tier}</span>
              <span className="mx-1.5">·</span>
              Confidence: <span className="text-ink-200">{draft.judgment.confidence}</span>
            </span>
          </div>
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
          DRAFT &middot;
          <span className="font-medium text-ink-200">
            {draft.client.displayName}
          </span>
          <span className={tierClass(draft.judgment.tier)}>
            {draft.judgment.tier} · {draft.judgment.confidence}
          </span>
          {draft.client.ownershipMode === 'relationship_partner' ? (
            <span
              className="rounded border border-amber-700 bg-amber-900/40 px-1.5 py-0.5 text-amber-200"
              title={
                draft.client.relationshipPartnerName
                  ? `Routed to ${draft.client.relationshipPartnerName}${
                      draft.client.relationshipPartnerFirm
                        ? ` (${draft.client.relationshipPartnerFirm})`
                        : ''
                    }`
                  : 'Relationship-partner-led'
              }
            >
              ↻ via {draft.client.relationshipPartnerName ?? 'partner'}
              {draft.client.relationshipPartnerFirm
                ? ` · ${draft.client.relationshipPartnerFirm}`
                : ''}
            </span>
          ) : (
            <span className="rounded border border-ink-700 px-1.5 py-0.5 text-ink-300">
              direct
            </span>
          )}
        </div>

        <form action={saveDraftAction} className="space-y-2">
          <input type="hidden" name="id" value={draft.id} />
          <label className="block">
            <span className="label mb-1 block">Subject</span>
            <input className="input" name="subject" defaultValue={draft.subject} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label mb-1 block">To</span>
              <input
                className="input"
                name="recipients"
                defaultValue={draft.recipientEmails.join(', ')}
              />
            </label>
            <label className="block">
              <span className="label mb-1 block">Cc</span>
              <input
                className="input"
                name="cc"
                defaultValue={draft.ccEmails.join(', ')}
              />
            </label>
          </div>
          <label className="block">
            <span className="label mb-1 block">Body</span>
            <textarea
              className="textarea"
              name="body"
              rows={14}
              defaultValue={draft.body}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="submit">
              Save edits
            </button>
            <CopyButton
              subject={draft.subject}
              body={draft.body}
              recipients={draft.recipientEmails}
              cc={draft.ccEmails}
            />
            <SubmitButton
              action={markSentAction}
              hiddenId={draft.id}
              label="Mark sent"
              variant="primary"
            />
            <DismissModal draftId={draft.id} />
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-400">
          <form action={regenerateDraftAction}>
            <input type="hidden" name="id" value={draft.id} />
            <button className="hover:text-sky-400" type="submit">
              ↻ Regenerate draft
            </button>
          </form>
          <form action={reprocessEventAction}>
            <input type="hidden" name="eventId" value={draft.eventId} />
            <button className="hover:text-sky-400" type="submit">
              ↻ Reprocess event (re-run relevance + draft for all clients)
            </button>
          </form>
          {draft.versions.length > 1 && (
            <a
              className="ml-auto hover:text-sky-400"
              href={`/inbox/${draft.id}/history`}
            >
              {draft.versions.length} versions →
            </a>
          )}
        </div>

        {/* WHY THIS CLIENT */}
        <div className="mt-6 rounded border border-ink-800 bg-ink-900/40 p-3 text-[13px]">
          <p className="label mb-2">Why this client?</p>
          <p className="mb-2 text-ink-200">
            <span className="font-medium">Angle:</span> {draft.judgment.angle}
          </p>
          <p className="mb-3 text-ink-300">{draft.judgment.rationale}</p>
          {draft.judgment.sourceExcerpts.length > 0 && (
            <div className="mb-3">
              <p className="label mb-1">Source excerpts grounding the judgment</p>
              <ul className="space-y-1">
                {draft.judgment.sourceExcerpts.map((s, i) => (
                  <li key={i} className="rounded bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-200">
                    "{s}"
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sourceClaims.length > 0 && (
            <div className="space-y-3">
              {(['source_publication', 'client_profile', 'authority_interaction', 'inference', 'other'] as const).map(
                (k) =>
                  (groupedClaims[k]?.length ?? 0) > 0 && (
                    <div key={k}>
                      <p className="label mb-1">{labelFor(k)}</p>
                      <ul className="space-y-1">
                        {groupedClaims[k]!.map((c, i) => {
                          const ev = c.evidence ?? c.sourceExcerpt ?? '';
                          return (
                            <li key={i} className="text-[11px]">
                              <span className="text-ink-200">"{c.claim}"</span>
                              {ev && (
                                <>
                                  <span className="text-ink-500"> ← </span>
                                  <span className="font-mono text-ink-400">"{ev}"</span>
                                </>
                              )}
                              {c.sourceUrl && (
                                <a
                                  className="ml-1 text-sky-400 hover:underline"
                                  href={c.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  ↗
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function labelFor(k: string): string {
  switch (k) {
    case 'source_publication':
      return 'From the source publication';
    case 'client_profile':
      return 'From the client profile';
    case 'authority_interaction':
      return 'From prior authority interactions';
    case 'inference':
      return 'Inferences (use cautiously)';
    default:
      return 'Other claims';
  }
}

function SubmitButton({
  action,
  hiddenId,
  label,
  variant,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenId: string;
  label: string;
  variant?: 'primary' | 'danger';
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={hiddenId} />
      <button
        type="submit"
        className={
          'btn ' + (variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : '')
        }
      >
        {label}
      </button>
    </form>
  );
}

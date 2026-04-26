import { prisma, type NormalisedEvent } from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';
import type { Authority, EventType } from '@bdu/lib';

const log = makeLogger('upsert-events');
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? 'default-workspace';

/**
 * Upsert an array of normalised events into the database, deduped by
 * contentHash. Returns the new event ids only — already-seen events are
 * silently skipped.
 */
export async function upsertEvents(events: NormalisedEvent[]): Promise<string[]> {
  const newIds: string[] = [];
  for (const e of events) {
    // Dedupe on the immutable identity tuple. caseRef may be null when the
    // adapter could not extract one — fall back to contentHash-only check.
    const existing = await prisma.event.findFirst({
      where: e.caseRef
        ? {
            authority: e.authority as Authority,
            caseRef: e.caseRef,
            eventType: e.eventType as EventType,
            publishedAt: e.publishedAt,
          }
        : { contentHash: e.contentHash },
      select: { id: true },
    });
    if (existing) continue;
    try {
      const created = await prisma.event.create({
        data: {
          workspaceId: WORKSPACE_ID,
          authority: e.authority as Authority,
          sourceUrl: e.sourceUrl,
          caseRef: e.caseRef ?? null,
          eventType: e.eventType as EventType,
          title: e.title,
          summary: e.summary,
          fullText: e.fullText,
          parties: e.parties,
          sectors: e.sectors,
          geographies: e.geographies,
          publishedAt: e.publishedAt,
          attachmentUrls: e.attachmentUrls,
          contentHash: e.contentHash,
        },
        select: { id: true },
      });
      newIds.push(created.id);
    } catch (err) {
      // Race against the unique constraint when two pollers insert
      // simultaneously. Treat as not-new.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/unique constraint|P2002/i.test(msg)) {
        log.warn('upsert failed', { hash: e.contentHash, err: msg });
      }
    }
  }
  return newIds;
}

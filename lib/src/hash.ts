import { createHash } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Build a stable contentHash for an event. Source url plus any volatile bits
 * removed; we hash on the immutable identity (authority, caseRef, eventType,
 * normalised title) so re-fetches produce the same hash.
 */
export function buildContentHash(parts: {
  authority: string;
  caseRef?: string | null;
  eventType: string;
  title: string;
  publishedAt: Date;
}): string {
  const norm = [
    parts.authority,
    parts.caseRef ?? '',
    parts.eventType,
    parts.title.trim().toLowerCase().replace(/\s+/g, ' '),
    parts.publishedAt.toISOString().slice(0, 10),
  ].join('|');
  return sha256(norm);
}

import { prisma } from './prisma.js';
import type { Authority, EventType } from './prisma.js';

/**
 * Filter-based exemplar retrieval. Returns up to N recently-sent drafts and
 * recently-dismissed drafts matching the same client + authority + eventType,
 * for use in the drafter prompt as "style only" exemplars.
 *
 * Embeddings deferred until the archive has volume.
 */
export async function retrieveExemplars(args: {
  clientId: string;
  authority: Authority;
  eventType: EventType;
  limit?: number;
}): Promise<{ subject: string; body: string; status: 'sent' | 'dismissed' }[]> {
  const limit = args.limit ?? 3;
  const sent = await prisma.draft.findMany({
    where: {
      clientId: args.clientId,
      status: 'sent',
      event: { authority: args.authority, eventType: args.eventType },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { subject: true, body: true },
  });
  if (sent.length >= limit) {
    return sent.map((d) => ({ ...d, status: 'sent' as const }));
  }

  const dismissed = await prisma.draft.findMany({
    where: {
      clientId: args.clientId,
      status: 'dismissed',
      event: { authority: args.authority, eventType: args.eventType },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit - sent.length,
    select: { subject: true, body: true },
  });
  return [
    ...sent.map((d) => ({ ...d, status: 'sent' as const })),
    ...dismissed.map((d) => ({ ...d, status: 'dismissed' as const })),
  ];
}

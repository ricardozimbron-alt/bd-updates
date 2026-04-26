import { prisma, sendOwnerNotification } from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';

const log = makeLogger('notify');

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? '';
const APP_URL =
  process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
const BATCH_WINDOW_MS =
  Number.parseInt(process.env.NOTIFICATION_BATCH_WINDOW_SECONDS ?? '300', 10) * 1000;

/**
 * Notify the owner about new high-tier drafts. Coalesces consecutive sends
 * within BATCH_WINDOW_MS into a single email. The email body never contains
 * client content - only a count and a deeplink.
 */
export async function notifyHighTierDrafts(draftIds: string[]): Promise<void> {
  if (draftIds.length === 0 || !OWNER_EMAIL) return;

  // Find user (owner). If none, no-op.
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    log.warn('owner user row not found; skipping notification', { OWNER_EMAIL });
    return;
  }

  // Look at the last notification for this user. If it's within the batch
  // window, mark these drafts as already covered.
  const cutoff = new Date(Date.now() - BATCH_WINDOW_MS);
  const recent = await prisma.notification.findFirst({
    where: { userId: owner.id, sentAt: { gte: cutoff } },
    orderBy: { sentAt: 'desc' },
  });
  if (recent) {
    // attach to the existing batch by stamping notifiedAt now
    await prisma.draft.updateMany({
      where: { id: { in: draftIds } },
      data: { notifiedAt: new Date() },
    });
    log.info('coalesced into recent batch', { count: draftIds.length });
    return;
  }

  // Look at all pending high-tier drafts in the window for the count.
  const allRecent = await prisma.draft.findMany({
    where: {
      status: 'pending',
      notifiedAt: null,
      judgment: { tier: 'high' },
    },
    select: { id: true },
  });
  const count = allRecent.length;
  const subject = count <= 1 ? 'New BD draft pending' : `${count} new BD drafts pending`;
  // Plain /inbox link. No token. The app redirects to the magic-link sign-in
  // if there's no session. We never put auth tokens in notification email.
  const link = new URL('/inbox', APP_URL).toString();
  const bodyText = `A new high-confidence draft is ready for review.\n\n${link}`;

  const send = await sendOwnerNotification({
    to: owner.email,
    subject,
    bodyText,
  });

  if (!send.delivered) {
    log.warn('notification not delivered', { reason: send.reason });
    return;
  }

  await prisma.notification.create({
    data: {
      userId: owner.id,
      channel: 'email',
      subject,
      bodyText,
    },
  });
  await prisma.draft.updateMany({
    where: { id: { in: allRecent.map((d) => d.id) } },
    data: { notifiedAt: new Date() },
  });
  log.info('notified', { count });
}


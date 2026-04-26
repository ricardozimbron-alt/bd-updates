/**
 * Run one round of "process all pending events" without starting cron.
 * Useful for end-to-end manual testing:
 *   pnpm --filter @bdu/worker process-pending
 *
 * Layered resilience:
 *   - Prisma client wraps every query with up-to-3 retries on connection-drop
 *     codes (lib/src/prisma.ts).
 *   - Each per-event tick is wrapped in its own try/catch so that one failure
 *     does not kill the loop.
 *   - The status-update inside the catch is itself wrapped so a connection
 *     drop during failure recovery cannot escalate.
 */
import { makeAnthropicProvider, prisma } from '@bdu/lib';
import { processEvent } from '../pipeline/process-event.js';
import { notifyHighTierDrafts } from '../pipeline/notify.js';

async function safeFailMark(id: string, msg: string) {
  try {
    await prisma.event.update({
      where: { id },
      data: { processingStatus: 'failed', processingError: msg.slice(0, 4000) },
    });
  } catch (err) {
    console.error('  (failed-mark also failed)', String(err).slice(0, 200));
  }
}

async function main() {
  const model = makeAnthropicProvider();
  const pending = await prisma.event.findMany({
    where: { processingStatus: 'pending' },
    orderBy: { detectedAt: 'asc' },
    select: { id: true, title: true },
  });
  console.error(`pending: ${pending.length}`);
  const allHigh: string[] = [];
  let success = 0;
  let failed = 0;
  for (const { id, title } of pending) {
    console.error(`processing: ${title}`);
    try {
      const r = await processEvent(id, model);
      allHigh.push(...r.highTierDraftIds);
      console.error(`  high=${r.highTierDraftIds.length} medium=${r.mediumTierDraftIds.length}`);
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${msg.split('\n')[0]}`);
      await safeFailMark(id, msg);
      failed++;
    }
  }
  console.error(`done. success=${success} failed=${failed} high-drafts=${allHigh.length}`);
  if (allHigh.length > 0) {
    console.error(`notifying high-tier: ${allHigh.length}`);
    try {
      await notifyHighTierDrafts(allHigh);
    } catch (err) {
      console.error('notify failed', String(err).slice(0, 200));
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});

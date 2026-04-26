/**
 * Run all source adapters and upsert events into the DB. No LLM. No drafts.
 * Used to populate the local DB with real source rows.
 *
 *   pnpm --filter @bdu/worker run seed-events
 */
import { prisma } from '@bdu/lib';
import { buildAllSources } from '../sources/index.js';
import { upsertEvents } from '../pipeline/upsert-events.js';

async function main() {
  const sources = buildAllSources();
  let total = 0;
  let inserted = 0;
  for (const src of sources) {
    console.log(`polling ${src.id} (${src.label}) …`);
    try {
      const r = await src.poll();
      const ids = await upsertEvents(r.events);
      console.log(`  ${r.events.length} events fetched, ${ids.length} new`);
      total += r.events.length;
      inserted += ids.length;
    } catch (err) {
      console.warn(`  ${src.id} failed:`, err);
    }
  }
  console.log(`done. total fetched ${total}, new ${inserted}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});

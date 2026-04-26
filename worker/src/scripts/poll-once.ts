/**
 * Run one source's poll() against live data and print the results to stdout.
 * No database, no LLM. Used during development to sanity-check adapters.
 *
 *   pnpm --filter @bdu/worker poll-once cma-atom
 */
import { buildAllSources } from '../sources/index.js';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: poll-once <source-id>');
    process.exit(2);
  }
  const sources = buildAllSources();
  const src = sources.find((s) => s.id === target);
  if (!src) {
    console.error(`unknown source: ${target}; known: ${sources.map((s) => s.id).join(', ')}`);
    process.exit(2);
  }
  console.error(`polling ${src.id} (${src.label})…`);
  const t0 = Date.now();
  const r = await src.poll();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.error(`done in ${elapsed}s — ${r.events.length} events; note: ${r.note ?? ''}`);
  for (const e of r.events.slice(0, 5)) {
    console.log('---');
    console.log(`[${e.authority}] ${e.eventType}  ${e.publishedAt.toISOString()}`);
    console.log(`  title    : ${e.title}`);
    console.log(`  caseRef  : ${e.caseRef ?? ''}`);
    console.log(`  parties  : ${e.parties.join(' | ')}`);
    console.log(`  sectors  : ${e.sectors.join(', ')}`);
    console.log(`  geographies: ${e.geographies.join(', ')}`);
    console.log(`  url      : ${e.sourceUrl}`);
    console.log(`  hash     : ${e.contentHash.slice(0, 16)}…`);
    console.log(`  summary  : ${e.summary.slice(0, 200)}`);
  }
  console.log('--- (truncated to first 5)');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});

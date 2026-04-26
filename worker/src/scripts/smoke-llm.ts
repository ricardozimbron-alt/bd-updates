/**
 * End-to-end LLM smoke test, no database, no auth, no Resend.
 *
 *   node --env-file=../.env --import tsx src/scripts/smoke-llm.ts
 *
 * Steps:
 *   1. Probe the configured model (assertModelReachable).
 *   2. Fetch one live CMA case via the cma-atom adapter (no DB write).
 *   3. Run the structured Pass-1 screen against a synthetic client.
 *   4. Run Pass-2 LLM relevance.
 *   5. Run the drafter.
 *   6. Print everything and exit.
 */
import {
  assertModelReachable,
  generateDraft,
  judgeRelevance,
  makeAnthropicProvider,
  structuredScreen,
  type ClientForRelevance,
} from '@bdu/lib';
import { makeCmaAtomSource } from '../sources/cma-atom.js';

async function main() {
  const t0 = Date.now();
  const model = makeAnthropicProvider();
  console.log(`[ ] probing model ${model.id} …`);
  await assertModelReachable(model);
  console.log(`[✓] model ${model.id} reachable (${Date.now() - t0} ms)`);

  console.log('[ ] polling cma-atom for fresh events …');
  const src = makeCmaAtomSource({ maxEntries: 10 });
  const polled = await src.poll();
  if (polled.events.length === 0) {
    throw new Error('cma-atom returned no events');
  }
  console.log(`[✓] ${polled.events.length} events fetched`);

  // Synthetic client deliberately calibrated to clear pass-1 against most
  // CMA merger cases, so we exercise the LLM pass.
  const client: ClientForRelevance = {
    id: 'synthetic-1',
    name: 'Test Client',
    displayName: 'Test Client plc',
    sectorTags: ['retail', 'e-commerce', 'consumer goods', 'logistics', 'media'],
    geographies: ['UK', 'EU'],
    confidenceThreshold: 60,
    tonePreference: 'practical, plain, no flattery',
    ownershipMode: 'mine',
    relationshipPartner: null,
    narrativeMarkdown: `Test Client plc is a diversified UK-headquartered consumer-facing
group with operations across retail, e-commerce, logistics, and media. Active
M&A appetite both as bidder and as a target. Past CMA engagement on a Phase 1
merger; experience with consumer-protection enforcement adjacent to digital
marketplaces. Sensitive to Phase 2 references and remedies that shape
downstream-supplier markets.`,
    entities: [
      { kind: 'competitor', value: 'eBay', notes: null },
      { kind: 'competitor', value: 'Depop', notes: null },
      { kind: 'watched_theme', value: 'online marketplace', notes: null },
      { kind: 'watched_theme', value: 'two-sided platform', notes: null },
      { kind: 'supplier', value: 'GXO', notes: null },
    ],
    authorityInteractions: [
      {
        authority: 'CMA',
        caseRef: 'ME/0000/00',
        year: 2024,
        summary: 'Phase 1 clearance for an own-bolt-on, no remedies.',
      },
    ],
    rules: [
      'Pure invitations to comment on cases without a clear product overlap should not be high tier on sector overlap alone.',
    ],
    primaryRecipients: [
      { name: 'Sam Carter', email: 'sam.carter@example.com', role: 'General Counsel' },
    ],
    ccRecipients: [
      { name: 'Alex Reed', email: 'alex.reed@example.com', role: 'Head of Strategy' },
    ],
  };

  // Pick the event whose Pass-1 surfaces the most matches against the
  // synthetic client. That's the one most likely to exercise the drafter.
  let event = polled.events[0]!;
  let bestScore = -1;
  for (const e of polled.events) {
    const r = structuredScreen(e, client);
    // Score: weight named-entity matches over sector/geography to find a
    // case that has commercial hooks rather than just sector overlap.
    const entityHits = r.matched.filter((m) => m.startsWith('entity:')).length;
    const otherHits = r.matched.length - entityHits;
    const score = entityHits * 5 + otherHits;
    if (score > bestScore) {
      bestScore = score;
      event = e;
    }
  }
  console.log(`[✓] picked event: [${event.eventType}] ${event.title}`);
  console.log(`     ${event.sourceUrl}`);

  console.log('[ ] pass-1 structured screen …');
  const screen = structuredScreen(event, client);
  console.log(`[${screen.passed ? '✓' : '✗'}] passed=${screen.passed} matched=${screen.matched.join(', ') || '—'}`);
  if (!screen.passed) {
    console.log('— pass-1 did not match this event for the synthetic client; aborting.');
    process.exit(0);
  }

  console.log('[ ] pass-2 LLM relevance call …');
  const ja = Date.now();
  const judgment = await judgeRelevance(event, client, model);
  console.log(`[✓] judgment in ${Date.now() - ja} ms:`);
  console.log(`    relevant   : ${judgment.relevant}`);
  console.log(`    confidence : ${judgment.confidence}`);
  console.log(`    tier       : ${judgment.tier}`);
  console.log(`    angle      : ${judgment.angle}`);
  console.log(`    rationale  : ${judgment.rationale}`);
  console.log(`    excerpts   :`);
  for (const e of judgment.sourceExcerpts) console.log(`       - "${e}"`);

  if (judgment.tier === 'low') {
    console.log('— tier=low; not generating a draft.');
    process.exit(0);
  }

  console.log('[ ] drafter call …');
  const da = Date.now();
  const draft = await generateDraft({ event, client, judgment, model });
  console.log(`[✓] draft in ${Date.now() - da} ms:`);
  console.log('--- subject ---');
  console.log(draft.subject);
  console.log('--- to ---');
  console.log(draft.recipientEmails.join(', '));
  console.log('--- cc ---');
  console.log(draft.ccEmails.join(', '));
  console.log('--- body ---');
  console.log(draft.body);
  console.log('--- source claims ---');
  for (const c of draft.sourceClaims) {
    console.log(`  [${c.basis}] "${c.claim}"`);
    console.log(`        ↳ ${c.evidence}`);
    if (c.sourceUrl) console.log(`        ↳ ${c.sourceUrl}`);
  }
  console.log('-----');
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});

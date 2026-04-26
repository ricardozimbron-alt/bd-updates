import { prisma } from '@bdu/lib';
async function main() {
  const id = process.argv[2];
  if (!id) { console.error('usage: show-draft <id>'); process.exit(2); }
  const d = await prisma.draft.findUniqueOrThrow({
    where: { id },
    include: { client: true, event: true, judgment: true },
  });
  const claims = (d.sourceClaims ?? []) as Array<{ claim: string; basis?: string; evidence?: string; sourceUrl?: string }>;

  console.log('=== EVENT (the source) ===');
  console.log(`title       : ${d.event.title}`);
  console.log(`authority   : ${d.event.authority}`);
  console.log(`eventType   : ${d.event.eventType}`);
  console.log(`publishedAt : ${d.event.publishedAt.toISOString()}`);
  console.log(`sourceUrl   : ${d.event.sourceUrl}`);
  console.log(`summary     : ${d.event.summary}`);
  console.log(`fullText    : ${d.event.fullText.slice(0, 700)}${d.event.fullText.length > 700 ? '…' : ''}`);
  console.log();

  console.log('=== RELEVANCE JUDGMENT (Pass-2) ===');
  console.log(`client      : ${d.client.displayName} (${d.client.ownershipMode})`);
  console.log(`tier        : ${d.judgment.tier}`);
  console.log(`confidence  : ${d.judgment.confidence}`);
  console.log(`angle       : ${d.judgment.angle}`);
  console.log(`rationale   : ${d.judgment.rationale}`);
  console.log(`source excerpts:`);
  for (const e of d.judgment.sourceExcerpts) console.log(`  - "${e}"`);
  console.log();

  console.log('=== WHY THIS CLIENT (internal-only, never sent) ===');
  console.log(d.whyThisClient || '(empty)');
  console.log();

  console.log('=== DRAFT (the email body that gets sent) ===');
  console.log(`Subject : ${d.subject}`);
  console.log(`To      : ${d.recipientEmails.join(', ')}`);
  if (d.ccEmails.length) console.log(`Cc      : ${d.ccEmails.join(', ')}`);
  console.log();
  console.log(d.body);
  console.log();

  console.log('=== SOURCE CLAIMS ===');
  for (const c of claims) {
    console.log(`[${c.basis ?? 'unknown'}]`);
    console.log(`  claim    : ${c.claim}`);
    console.log(`  evidence : ${c.evidence}`);
    if (c.sourceUrl) console.log(`  sourceUrl: ${c.sourceUrl}`);
  }
  await prisma.$disconnect();
}
main();

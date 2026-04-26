import { prisma } from '@bdu/lib';

async function main() {
  const counts = await prisma.event.groupBy({
    by: ['processingStatus'],
    _count: { _all: true },
  });
  console.log('events by status:');
  for (const c of counts) console.log(`  ${c.processingStatus}: ${c._count._all}`);

  const judgments = await prisma.relevanceJudgment.count();
  const drafts = await prisma.draft.count();
  console.log(`\nrelevance judgments: ${judgments}`);
  console.log(`drafts: ${drafts}`);

  const tierBreakdown = await prisma.relevanceJudgment.groupBy({
    by: ['tier'],
    _count: { _all: true },
  });
  console.log('\njudgments by tier:');
  for (const t of tierBreakdown) console.log(`  ${t.tier}: ${t._count._all}`);

  const ds = await prisma.draft.findMany({
    include: { client: true, event: true, judgment: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('\ndrafts (latest 5):');
  for (const d of ds) {
    console.log(`  ${d.client.displayName} on "${d.event.title}" (${d.judgment.tier}/${d.judgment.confidence})`);
  }
  await prisma.$disconnect();
}
main();

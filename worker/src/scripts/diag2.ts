import { prisma } from '@bdu/lib';
async function main() {
  const high = await prisma.relevanceJudgment.findFirst({
    where: { tier: 'high' },
    include: { event: true, client: true },
  });
  if (high) {
    console.log('HIGH judgment found:');
    console.log('  client:', high.client.displayName);
    console.log('  event :', high.event.title);
    console.log('  conf  :', high.confidence);
    console.log('  angle :', high.angle);
    console.log('  hasDraft?', !!(await prisma.draft.findFirst({
      where: { relevanceJudgmentId: high.id },
    })));
  } else {
    console.log('no high-tier judgment found');
  }
  await prisma.$disconnect();
}
main();

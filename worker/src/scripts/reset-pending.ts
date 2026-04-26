import { prisma } from '@bdu/lib';
async function main() {
  const r = await prisma.event.updateMany({
    where: { processingStatus: { in: ['processing', 'failed'] } },
    data: { processingStatus: 'pending', processingError: null, processedAt: null },
  });
  console.log(`reset ${r.count} events to pending`);
  // Also clear any partial RelevanceJudgment rows from the failed run
  await prisma.$disconnect();
}
main();

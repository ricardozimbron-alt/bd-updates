import { prisma } from '@bdu/lib';
async function main() {
  const r = await prisma.event.groupBy({
    by: ['authority', 'eventType'],
    _count: { _all: true },
    orderBy: { authority: 'asc' },
  });
  for (const row of r) {
    console.log(`${row.authority.padEnd(4)} ${row.eventType.padEnd(32)} ${row._count._all}`);
  }
  const total = await prisma.event.count();
  console.log('---');
  console.log('total events:', total);
  await prisma.$disconnect();
}
main();

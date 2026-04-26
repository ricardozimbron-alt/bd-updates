import { prisma } from '@bdu/lib';
async function main() {
  const d = await prisma.draft.findFirst({
    where: { event: { title: { contains: 'GXO' } }, client: { name: 'Acme Industries' } },
    orderBy: { createdAt: 'desc' },
  });
  if (d) console.log(d.id);
  await prisma.$disconnect();
}
main();

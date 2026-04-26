import { prisma } from '@bdu/lib';

export async function recordSuccess(sourceId: string, label: string, note?: string) {
  await prisma.sourceHealth.upsert({
    where: { sourceId },
    create: {
      sourceId,
      label,
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      lastNote: note ?? null,
    },
    update: {
      label,
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      lastError: null,
      lastNote: note ?? null,
    },
  });
}

export async function recordFailure(sourceId: string, label: string, error: string) {
  const existing = await prisma.sourceHealth.findUnique({ where: { sourceId } });
  await prisma.sourceHealth.upsert({
    where: { sourceId },
    create: {
      sourceId,
      label,
      lastFailureAt: new Date(),
      consecutiveFailures: 1,
      lastError: error,
    },
    update: {
      label,
      lastFailureAt: new Date(),
      consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
      lastError: error,
    },
  });
}

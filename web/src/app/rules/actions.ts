'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';

export async function addRuleAction(formData: FormData) {
  await requireOwner();
  const scope = String(formData.get('scope') ?? 'global');
  const clientId = String(formData.get('clientId') ?? '');
  const rule = String(formData.get('rule') ?? '').trim();
  if (!rule) return;
  await prisma.clientRelevanceRule.create({
    data: {
      scope: scope === 'client' ? 'client' : 'global',
      clientId: scope === 'client' && clientId ? clientId : null,
      rule,
      active: true,
      status: 'active',
      source: 'user',
    },
  });
  revalidatePath('/rules');
}

export async function toggleRuleAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const r = await prisma.clientRelevanceRule.findUniqueOrThrow({ where: { id } });
  await prisma.clientRelevanceRule.update({
    where: { id },
    data: { active: !r.active },
  });
  revalidatePath('/rules');
}

export async function deleteRuleAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  await prisma.clientRelevanceRule.delete({ where: { id } });
  revalidatePath('/rules');
}

/** Promote an assistant-proposed candidate to active. */
export async function approveCandidateRuleAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  await prisma.clientRelevanceRule.update({
    where: { id },
    data: { status: 'active', active: true },
  });
  revalidatePath('/rules');
}

/** Mark a candidate rejected (kept for audit; not consulted by engine). */
export async function rejectCandidateRuleAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  await prisma.clientRelevanceRule.update({
    where: { id },
    data: { status: 'rejected', active: false },
  });
  revalidatePath('/rules');
}

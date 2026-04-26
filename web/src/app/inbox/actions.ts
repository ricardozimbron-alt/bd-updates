'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@bdu/lib';
import { requireOwner } from '@/lib/auth-guard';
import { callWorkerAdmin } from '@/lib/worker-admin';

export async function saveDraftAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const subject = String(formData.get('subject') ?? '').slice(0, 500);
  const body = String(formData.get('body') ?? '');
  const recipients = String(formData.get('recipients') ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cc = String(formData.get('cc') ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const updated = await prisma.draft.update({
    where: { id },
    data: { subject, body, recipientEmails: recipients, ccEmails: cc },
  });
  await prisma.draftVersion.create({
    data: { draftId: updated.id, body, subject, editedBy: 'user' },
  });
  revalidatePath('/inbox');
}

export async function markSentAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.draft.update({ where: { id }, data: { status: 'sent' } }),
    prisma.send.create({
      data: {
        draftId: id,
        finalSubject: draft.subject,
        finalBody: draft.body,
        finalRecipients: draft.recipientEmails,
        finalCc: draft.ccEmails,
      },
    }),
    prisma.feedback.create({
      data: {
        draftId: id,
        clientId: draft.clientId,
        kind: 'send-as-is',
      },
    }),
  ]);
  revalidatePath('/inbox');
  redirect('/inbox');
}

const dismissSchema = z.object({
  id: z.string(),
  categories: z.array(z.string()).default([]),
  freeText: z.string().default(''),
  scopeClientSpecific: z.boolean().default(false),
  scopeCrossClient: z.boolean().default(false),
});

export async function regenerateDraftAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  await callWorkerAdmin('/admin/regenerate-draft', { id });
  revalidatePath('/inbox');
}

export async function reprocessEventAction(formData: FormData) {
  await requireOwner();
  const eventId = String(formData.get('eventId') ?? '');
  await callWorkerAdmin('/admin/reprocess-event', { id: eventId });
  revalidatePath('/inbox');
}

export async function pollNowAction(formData: FormData) {
  await requireOwner();
  const source = String(formData.get('source') ?? '');
  await callWorkerAdmin('/admin/poll', { source });
  revalidatePath('/sources');
}

export async function bulkDismissAction(formData: FormData) {
  await requireOwner();
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  const reason = String(formData.get('reason') ?? '').trim();
  const ruleScope = String(formData.get('ruleScope') ?? ''); // "" | "global" | "client"
  const ruleText = String(formData.get('ruleText') ?? '').trim();
  if (ids.length === 0) return;

  const drafts = await prisma.draft.findMany({
    where: { id: { in: ids } },
    select: { id: true, clientId: true },
  });
  for (const d of drafts) {
    await prisma.$transaction([
      prisma.draft.update({ where: { id: d.id }, data: { status: 'dismissed' } }),
      prisma.dismissal.create({
        data: {
          draftId: d.id,
          categories: ['Bulk-dismissed'],
          freeText: reason || null,
          scopeClientSpecific: ruleScope === 'client',
          scopeCrossClient: ruleScope === 'global',
        },
      }),
      prisma.feedback.create({
        data: {
          draftId: d.id,
          clientId: d.clientId,
          kind: 'dismissal',
          categories: ['Bulk-dismissed'],
          freeText: reason || null,
          scopeClientSpecific: ruleScope === 'client',
          scopeCrossClient: ruleScope === 'global',
        },
      }),
    ]);
  }

  if (ruleText && (ruleScope === 'global' || ruleScope === 'client')) {
    // Use the first draft's clientId for client-scoped rules.
    const clientId = ruleScope === 'client' ? drafts[0]?.clientId ?? null : null;
    await prisma.clientRelevanceRule.create({
      data: {
        scope: ruleScope,
        clientId,
        rule: ruleText,
        active: true,
        status: 'active',
        source: 'bulk_dismiss',
      },
    });
  }

  revalidatePath('/inbox');
  redirect('/inbox');
}

export async function dismissAction(formData: FormData) {
  await requireOwner();
  const data = dismissSchema.parse({
    id: formData.get('id'),
    categories: formData.getAll('categories').map(String),
    freeText: formData.get('freeText') ?? '',
    scopeClientSpecific: formData.get('scopeClientSpecific') === 'on',
    scopeCrossClient: formData.get('scopeCrossClient') === 'on',
  });
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: data.id } });
  await prisma.$transaction([
    prisma.draft.update({ where: { id: data.id }, data: { status: 'dismissed' } }),
    prisma.dismissal.create({
      data: {
        draftId: data.id,
        categories: data.categories,
        freeText: data.freeText || null,
        scopeClientSpecific: data.scopeClientSpecific,
        scopeCrossClient: data.scopeCrossClient,
      },
    }),
    prisma.feedback.create({
      data: {
        draftId: data.id,
        clientId: draft.clientId,
        kind: 'dismissal',
        categories: data.categories,
        freeText: data.freeText || null,
        scopeClientSpecific: data.scopeClientSpecific,
        scopeCrossClient: data.scopeCrossClient,
      },
    }),
  ]);
  revalidatePath('/inbox');
  redirect('/inbox');
}

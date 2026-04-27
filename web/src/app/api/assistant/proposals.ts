'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@bdu/lib';
import { auth } from '@/auth';

const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? '').toLowerCase();

async function gate() {
  const s = await auth();
  if (!s?.user?.email || s.user.email.toLowerCase() !== OWNER_EMAIL) {
    throw new Error('forbidden');
  }
}

/**
 * Apply an assistant-emitted proposal. Called from the assistant UI when the
 * user clicks Approve. Any throw aborts the write.
 */
export async function applyAssistantProposalAction(
  proposalJson: string,
): Promise<{ ok: true; effect: string }> {
  await gate();
  const p = JSON.parse(proposalJson) as { type: string } & Record<string, unknown>;

  switch (p.type) {
    case 'update_client_profile': {
      const clientId = String(p.clientId);
      const md = String(p.narrativeMarkdown ?? '');
      await prisma.clientProfile.upsert({
        where: { clientId },
        create: { clientId, narrativeMarkdown: md },
        update: { narrativeMarkdown: md },
      });
      revalidatePath(`/clients/${clientId}`);
      return { ok: true, effect: 'Profile updated' };
    }
    case 'set_client_ownership': {
      const clientId = String(p.clientId);
      const mode = String(p.mode);
      if (mode !== 'mine' && mode !== 'relationship_partner') throw new Error('invalid mode');
      await prisma.client.update({
        where: { id: clientId },
        data: {
          ownershipMode: mode,
          relationshipPartnerName:
            mode === 'relationship_partner' ? (p.partnerName as string | null) ?? null : null,
          relationshipPartnerEmail:
            mode === 'relationship_partner' ? (p.partnerEmail as string | null) ?? null : null,
          relationshipPartnerFirm:
            mode === 'relationship_partner' ? (p.partnerFirm as string | null) ?? null : null,
        },
      });
      revalidatePath(`/clients/${clientId}`);
      revalidatePath('/clients');
      return { ok: true, effect: `Ownership set to ${mode}` };
    }
    case 'add_relevance_rule': {
      const scope = String(p.scope);
      const rule = String(p.rule ?? '').trim();
      const clientId = (p.clientId as string | undefined) ?? null;
      if (!rule) throw new Error('rule text empty');
      if (scope !== 'global' && scope !== 'client') throw new Error('invalid scope');
      // Assistant-proposed rules go in as candidate, NOT active. The user
      // must promote them on /rules to make them affect future relevance
      // calls.
      await prisma.clientRelevanceRule.create({
        data: {
          scope,
          rule,
          active: false,
          status: 'candidate',
          source: 'assistant',
          clientId: scope === 'client' ? clientId : null,
        },
      });
      revalidatePath('/rules');
      return { ok: true, effect: 'Rule saved as candidate (review on /rules)' };
    }
    case 'dismiss_draft': {
      const id = String(p.draftId);
      const draft = await prisma.draft.findUniqueOrThrow({ where: { id } });
      await prisma.$transaction([
        prisma.draft.update({ where: { id }, data: { status: 'dismissed' } }),
        prisma.dismissal.upsert({
          where: { draftId: id },
          create: {
            draftId: id,
            categories: (p.categories as string[] | undefined) ?? [],
            freeText: (p.freeText as string | undefined) ?? null,
            scopeClientSpecific: Boolean(p.scopeClientSpecific),
            scopeCrossClient: Boolean(p.scopeCrossClient),
          },
          update: {},
        }),
        prisma.feedback.create({
          data: {
            draftId: id,
            clientId: draft.clientId,
            kind: 'dismissal',
            categories: (p.categories as string[] | undefined) ?? [],
            freeText: (p.freeText as string | undefined) ?? null,
            scopeClientSpecific: Boolean(p.scopeClientSpecific),
            scopeCrossClient: Boolean(p.scopeCrossClient),
          },
        }),
      ]);
      revalidatePath('/inbox');
      return { ok: true, effect: 'Draft dismissed' };
    }
    case 'mark_draft_sent': {
      const id = String(p.draftId);
      const draft = await prisma.draft.findUniqueOrThrow({ where: { id } });
      await prisma.$transaction([
        prisma.draft.update({ where: { id }, data: { status: 'sent' } }),
        prisma.send.upsert({
          where: { draftId: id },
          create: {
            draftId: id,
            finalSubject: draft.subject,
            finalBody: draft.body,
            finalRecipients: draft.recipientEmails,
            finalCc: draft.ccEmails,
          },
          update: {},
        }),
      ]);
      revalidatePath('/inbox');
      return { ok: true, effect: 'Draft marked sent' };
    }
    default:
      throw new Error(`unknown proposal type: ${p.type}`);
  }
}

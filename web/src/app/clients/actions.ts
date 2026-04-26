'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@bdu/lib';
import type { EntityKind, OwnershipMode } from '@bdu/lib/prisma';
import { requireOwner } from '@/lib/auth-guard';

const ENTITY_KINDS: EntityKind[] = [
  'competitor',
  'customer',
  'supplier',
  'portfolio_company',
  'watched_theme',
  'watched_phrase',
];

function csv(s: FormDataEntryValue | null): string[] {
  return String(s ?? '')
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function ownershipFromForm(formData: FormData): {
  ownershipMode: OwnershipMode;
  relationshipPartnerName: string | null;
  relationshipPartnerEmail: string | null;
  relationshipPartnerFirm: string | null;
} {
  const raw = String(formData.get('ownershipMode') ?? 'mine');
  const ownershipMode: OwnershipMode = raw === 'relationship_partner' ? 'relationship_partner' : 'mine';
  if (ownershipMode === 'mine') {
    return {
      ownershipMode,
      relationshipPartnerName: null,
      relationshipPartnerEmail: null,
      relationshipPartnerFirm: null,
    };
  }
  return {
    ownershipMode,
    relationshipPartnerName: String(formData.get('relationshipPartnerName') ?? '').trim() || null,
    relationshipPartnerEmail: String(formData.get('relationshipPartnerEmail') ?? '').trim() || null,
    relationshipPartnerFirm: String(formData.get('relationshipPartnerFirm') ?? '').trim() || null,
  };
}

export async function createClientAction(formData: FormData) {
  await requireOwner();
  const created = await prisma.client.create({
    data: {
      name: String(formData.get('name') ?? '').trim(),
      displayName: String(formData.get('displayName') ?? '').trim(),
      sectorTags: csv(formData.get('sectorTags')),
      geographies: csv(formData.get('geographies')),
      confidenceThreshold: Number.parseInt(String(formData.get('confidenceThreshold') ?? '70'), 10),
      tonePreference: String(formData.get('tonePreference') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
      ...ownershipFromForm(formData),
    },
  });
  redirect(`/clients/${created.id}`);
}

export async function quickToggleOwnershipAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const c = await prisma.client.findUniqueOrThrow({ where: { id } });
  const next: OwnershipMode = c.ownershipMode === 'mine' ? 'relationship_partner' : 'mine';
  await prisma.client.update({
    where: { id },
    data: { ownershipMode: next },
  });
  revalidatePath('/clients');
}

export async function updateClientAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  await prisma.client.update({
    where: { id },
    data: {
      name: String(formData.get('name') ?? '').trim(),
      displayName: String(formData.get('displayName') ?? '').trim(),
      sectorTags: csv(formData.get('sectorTags')),
      geographies: csv(formData.get('geographies')),
      confidenceThreshold: Number.parseInt(String(formData.get('confidenceThreshold') ?? '70'), 10),
      tonePreference: String(formData.get('tonePreference') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
      archived: formData.get('archived') === 'on',
      ...ownershipFromForm(formData),
    },
  });
  revalidatePath(`/clients/${id}`);
}

export async function setProfileAction(formData: FormData) {
  await requireOwner();
  const clientId = String(formData.get('clientId') ?? '');
  const md = String(formData.get('narrativeMarkdown') ?? '');
  await prisma.clientProfile.upsert({
    where: { clientId },
    create: { clientId, narrativeMarkdown: md },
    update: { narrativeMarkdown: md },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function importClientFromMarkdownAction(formData: FormData) {
  await requireOwner();
  const md = String(formData.get('markdown') ?? '');
  const name = (md.match(/^#\s+(.+)$/m)?.[1] ?? 'Imported client').trim();
  const c = await prisma.client.create({
    data: {
      name,
      displayName: name,
      profile: { create: { narrativeMarkdown: md } },
    },
  });
  redirect(`/clients/${c.id}`);
}

export async function addContactAction(formData: FormData) {
  await requireOwner();
  const clientId = String(formData.get('clientId') ?? '');
  await prisma.clientContact.create({
    data: {
      clientId,
      name: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      role: String(formData.get('role') ?? '').trim() || null,
      isPrimary: formData.get('isPrimary') === 'on',
      isCc: formData.get('isCc') === 'on',
    },
  });
  revalidatePath(`/clients/${clientId}/contacts`);
}

export async function deleteContactAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const clientId = String(formData.get('clientId') ?? '');
  await prisma.clientContact.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}/contacts`);
}

export async function addEntityAction(formData: FormData) {
  await requireOwner();
  const clientId = String(formData.get('clientId') ?? '');
  const kindRaw = String(formData.get('kind') ?? '');
  const kind = (ENTITY_KINDS.includes(kindRaw as EntityKind)
    ? (kindRaw as EntityKind)
    : 'watched_theme') satisfies EntityKind;
  await prisma.clientEntity.create({
    data: {
      clientId,
      kind,
      value: String(formData.get('value') ?? '').trim(),
      notes: String(formData.get('notes') ?? '').trim() || null,
    },
  });
  revalidatePath(`/clients/${clientId}/entities`);
}

export async function deleteEntityAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const clientId = String(formData.get('clientId') ?? '');
  await prisma.clientEntity.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}/entities`);
}

export async function addInteractionAction(formData: FormData) {
  await requireOwner();
  const clientId = String(formData.get('clientId') ?? '');
  const yearRaw = String(formData.get('year') ?? '');
  await prisma.clientAuthorityInteraction.create({
    data: {
      clientId,
      authority: String(formData.get('authority') ?? 'CMA').trim(),
      caseRef: String(formData.get('caseRef') ?? '').trim() || null,
      year: yearRaw ? Number.parseInt(yearRaw, 10) : null,
      summary: String(formData.get('summary') ?? '').trim(),
      surfaceInPrompt: formData.get('surfaceInPrompt') === 'on',
    },
  });
  revalidatePath(`/clients/${clientId}/interactions`);
}

export async function deleteInteractionAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get('id') ?? '');
  const clientId = String(formData.get('clientId') ?? '');
  await prisma.clientAuthorityInteraction.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}/interactions`);
}

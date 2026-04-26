import {
  generateDraft,
  prisma,
  retrieveExemplars,
  type ClientForRelevance,
  type ModelProvider,
  type NormalisedEvent,
} from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';

const log = makeLogger('regenerate-draft');

export async function regenerateDraft(draftId: string, model: ModelProvider): Promise<void> {
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
    include: {
      client: {
        include: {
          profile: true,
          contacts: true,
          entities: true,
          interactions: { where: { surfaceInPrompt: true } },
        },
      },
      event: true,
      judgment: true,
    },
  });

  const event: NormalisedEvent = {
    authority: draft.event.authority,
    sourceUrl: draft.event.sourceUrl,
    caseRef: draft.event.caseRef,
    eventType: draft.event.eventType,
    title: draft.event.title,
    summary: draft.event.summary,
    fullText: draft.event.fullText,
    parties: draft.event.parties,
    sectors: draft.event.sectors,
    geographies: draft.event.geographies,
    publishedAt: draft.event.publishedAt,
    attachmentUrls: draft.event.attachmentUrls,
    contentHash: draft.event.contentHash,
  };

  const c = draft.client;
  const client: ClientForRelevance = {
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    sectorTags: c.sectorTags,
    geographies: c.geographies,
    confidenceThreshold: c.confidenceThreshold,
    tonePreference: c.tonePreference,
    narrativeMarkdown: c.profile?.narrativeMarkdown ?? null,
    ownershipMode: c.ownershipMode,
    relationshipPartner:
      c.ownershipMode === 'relationship_partner' &&
      c.relationshipPartnerName &&
      c.relationshipPartnerEmail
        ? {
            name: c.relationshipPartnerName,
            email: c.relationshipPartnerEmail,
            firm: c.relationshipPartnerFirm,
          }
        : null,
    entities: c.entities.map((e) => ({ kind: e.kind, value: e.value, notes: e.notes })),
    authorityInteractions: c.interactions.map((i) => ({
      authority: i.authority,
      caseRef: i.caseRef,
      year: i.year,
      summary: i.summary,
    })),
    rules: [],
    primaryRecipients: c.contacts
      .filter((x) => x.isPrimary)
      .map((x) => ({ name: x.name, email: x.email, role: x.role })),
    ccRecipients: c.contacts
      .filter((x) => x.isCc)
      .map((x) => ({ name: x.name, email: x.email, role: x.role })),
  };

  const exemplars = await retrieveExemplars({
    clientId: c.id,
    authority: event.authority,
    eventType: event.eventType,
    limit: 3,
  });

  const judgment = {
    relevant: true,
    confidence: draft.judgment.confidence,
    tier: draft.judgment.tier,
    rationale: draft.judgment.rationale,
    angle: draft.judgment.angle,
    sourceExcerpts: draft.judgment.sourceExcerpts,
    promptVersion: draft.judgment.promptVersion,
    modelId: draft.judgment.modelId,
  };

  const next = await generateDraft({ event, client, judgment, exemplars, model });

  await prisma.$transaction([
    prisma.draftVersion.create({
      data: {
        draftId: draft.id,
        body: draft.body,
        subject: draft.subject,
        editedBy: 'model',
      },
    }),
    prisma.draft.update({
      where: { id: draft.id },
      data: {
        subject: next.subject,
        body: next.body,
        whyThisClient: next.whyThisClient,
        recipientEmails: next.recipientEmails,
        ccEmails: next.ccEmails,
        sourceClaims: JSON.parse(JSON.stringify(next.sourceClaims)) as object,
        promptVersion: next.promptVersion,
        modelId: next.modelId,
      },
    }),
    prisma.draftVersion.create({
      data: {
        draftId: draft.id,
        body: next.body,
        subject: next.subject,
        editedBy: 'model',
      },
    }),
  ]);
  log.info('draft regenerated', { draftId });
}

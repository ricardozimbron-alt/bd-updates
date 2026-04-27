import {
  prisma,
  judgeRelevance,
  generateDraft,
  retrieveExemplars,
  structuredScreen,
  type ClientForRelevance,
  type DraftPayload,
  type ModelProvider,
  type NormalisedEvent,
  type RelevanceJudgment,
  type RelevanceTier,
} from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';

const log = makeLogger('process-event');
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? 'default-workspace';

/**
 * Process a single event end-to-end:
 *   1. load all (non-archived) clients with profile context
 *   2. Pass 1 structured screen
 *   3. Pass 2 LLM relevance judgment for each surviving (event, client)
 *   4. for tier high/medium: persist draft. mark high-tier for notification.
 *
 * Returns the draftIds that should trigger a notification (tier=high).
 */
export async function processEvent(
  eventId: string,
  model: ModelProvider,
): Promise<{ highTierDraftIds: string[]; mediumTierDraftIds: string[] }> {
  const dbEvent = await prisma.event.findUnique({ where: { id: eventId } });
  if (!dbEvent) throw new Error(`event not found: ${eventId}`);

  const claimed = await prisma.event.updateMany({
    where: { id: eventId, processingStatus: 'pending' },
    data: { processingStatus: 'processing', processingError: null },
  });
  if (claimed.count === 0) {
    log.info('skip: event is not pending', { eventId, status: dbEvent.processingStatus });
    return { highTierDraftIds: [], mediumTierDraftIds: [] };
  }

  const event: NormalisedEvent = {
    authority: dbEvent.authority,
    sourceUrl: dbEvent.sourceUrl,
    caseRef: dbEvent.caseRef,
    eventType: dbEvent.eventType,
    title: dbEvent.title,
    summary: dbEvent.summary,
    fullText: dbEvent.fullText,
    parties: dbEvent.parties,
    sectors: dbEvent.sectors,
    geographies: dbEvent.geographies,
    publishedAt: dbEvent.publishedAt,
    attachmentUrls: dbEvent.attachmentUrls,
    contentHash: dbEvent.contentHash,
  };

  const clients = await loadClients();
  const highTierDraftIds: string[] = [];
  const mediumTierDraftIds: string[] = [];

  for (const client of clients) {
    // Skip if we already judged this (event, client) pair (e.g. retry)
    const seen = await prisma.relevanceJudgment.findUnique({
      where: { eventId_clientId: { eventId, clientId: client.id } },
    });
    if (seen) continue;

    const screen = structuredScreen(event, client);
    if (!screen.passed) continue;

    let judgment: RelevanceJudgment;
    try {
      judgment = await judgeRelevance(event, client, model);
    } catch (err) {
      log.warn('judge failed', { eventId, clientId: client.id, err: String(err) });
      continue;
    }

    const judgmentRow = await prisma.relevanceJudgment.create({
      data: {
        workspaceId: WORKSPACE_ID,
        eventId,
        clientId: client.id,
        confidence: judgment.confidence,
        tier: judgment.tier,
        rationale: judgment.rationale,
        angle: judgment.angle,
        sourceExcerpts: judgment.sourceExcerpts,
        promptVersion: judgment.promptVersion,
        modelId: judgment.modelId,
      },
    });

    if (judgment.tier === 'low') continue;

    const exemplars = await retrieveExemplars({
      clientId: client.id,
      authority: event.authority,
      eventType: event.eventType,
      limit: 3,
    });
    let draft: DraftPayload;
    try {
      draft = await generateDraft({ event, client, judgment, exemplars, model });
    } catch (err) {
      log.warn('draft failed', { eventId, clientId: client.id, err: String(err) });
      continue;
    }

    const draftRow = await prisma.draft.create({
      data: {
        workspaceId: WORKSPACE_ID,
        eventId,
        clientId: client.id,
        relevanceJudgmentId: judgmentRow.id,
        subject: draft.subject,
        body: draft.body,
        whyThisClient: draft.whyThisClient,
        recipientEmails: draft.recipientEmails,
        ccEmails: draft.ccEmails,
        sourceClaims: jsonForPrisma(draft.sourceClaims),
        promptVersion: draft.promptVersion,
        modelId: draft.modelId,
      },
    });
    await prisma.draftVersion.create({
      data: {
        draftId: draftRow.id,
        body: draft.body,
        subject: draft.subject,
        editedBy: 'model',
      },
    });

    if (judgment.tier === 'high') highTierDraftIds.push(draftRow.id);
    else if (judgment.tier === 'medium') mediumTierDraftIds.push(draftRow.id);
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { processingStatus: 'done', processedAt: new Date() },
  });

  return { highTierDraftIds, mediumTierDraftIds };
}

async function loadClients(): Promise<ClientForRelevance[]> {
  const dbClients = await prisma.client.findMany({
    where: { workspaceId: WORKSPACE_ID, archived: false },
    include: {
      profile: true,
      contacts: true,
      entities: true,
      interactions: { where: { surfaceInPrompt: true } },
    },
  });
  const globalRules = await prisma.clientRelevanceRule.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      scope: 'global',
      active: true,
      status: 'active',
      clientId: null,
    },
  });

  const result: ClientForRelevance[] = [];
  for (const c of dbClients) {
    const clientRules = await prisma.clientRelevanceRule.findMany({
      where: {
        clientId: c.id,
        scope: 'client',
        active: true,
        status: 'active',
      },
    });
    result.push({
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
      entities: c.entities.map((e) => ({
        kind: e.kind,
        value: e.value,
        notes: e.notes,
      })),
      authorityInteractions: c.interactions.map((i) => ({
        authority: i.authority,
        caseRef: i.caseRef,
        year: i.year,
        summary: i.summary,
      })),
      rules: [
        ...clientRules.map((r) => r.rule),
        ...globalRules.map((r) => r.rule),
      ],
      primaryRecipients: c.contacts
        .filter((x) => x.isPrimary)
        .map((x) => ({ name: x.name, email: x.email, role: x.role })),
      ccRecipients: c.contacts
        .filter((x) => x.isCc)
        .map((x) => ({ name: x.name, email: x.email, role: x.role })),
    });
  }
  return result;
}

/** Used by the notification batcher to label tier counts. */
export type DraftTierBucket = Record<RelevanceTier, number>;

/** JSON.parse(JSON.stringify(...)) drops `undefined` and gives Prisma a clean payload. */
function jsonForPrisma<T>(v: T): object {
  return JSON.parse(JSON.stringify(v)) as object;
}

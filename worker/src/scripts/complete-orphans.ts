/**
 * Find relevance judgments with tier in (high, medium) that have no draft and
 * generate the draft now. Recovers from connection-drop failures during the
 * draft-create step of process-event.
 */
import {
  generateDraft,
  makeAnthropicProvider,
  prisma,
  retrieveExemplars,
  type ClientForRelevance,
  type NormalisedEvent,
} from '@bdu/lib';

async function main() {
  const model = makeAnthropicProvider();
  const orphans = await prisma.relevanceJudgment.findMany({
    where: {
      tier: { in: ['high', 'medium'] },
      draft: { is: null },
    },
    include: {
      event: true,
      client: {
        include: {
          profile: true,
          contacts: true,
          entities: true,
          interactions: { where: { surfaceInPrompt: true } },
        },
      },
    },
  });
  console.error(`orphans: ${orphans.length}`);

  for (const j of orphans) {
    console.error(
      `  ↻ ${j.client.displayName} :: ${j.event.title} (${j.tier}/${j.confidence})`,
    );
    const event: NormalisedEvent = {
      authority: j.event.authority,
      sourceUrl: j.event.sourceUrl,
      caseRef: j.event.caseRef,
      eventType: j.event.eventType,
      title: j.event.title,
      summary: j.event.summary,
      fullText: j.event.fullText,
      parties: j.event.parties,
      sectors: j.event.sectors,
      geographies: j.event.geographies,
      publishedAt: j.event.publishedAt,
      attachmentUrls: j.event.attachmentUrls,
      contentHash: j.event.contentHash,
    };
    const c = j.client;
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
      confidence: j.confidence,
      tier: j.tier,
      rationale: j.rationale,
      angle: j.angle,
      sourceExcerpts: j.sourceExcerpts,
      promptVersion: j.promptVersion,
      modelId: j.modelId,
    };

    try {
      const draft = await generateDraft({ event, client, judgment, exemplars, model });
      const draftRow = await prisma.draft.create({
        data: {
          eventId: j.eventId,
          clientId: c.id,
          relevanceJudgmentId: j.id,
          subject: draft.subject,
          body: draft.body,
          whyThisClient: draft.whyThisClient,
          recipientEmails: draft.recipientEmails,
          ccEmails: draft.ccEmails,
          sourceClaims: JSON.parse(JSON.stringify(draft.sourceClaims)) as object,
          promptVersion: draft.promptVersion,
          modelId: draft.modelId,
        },
      });
      await prisma.draftVersion.create({
        data: { draftId: draftRow.id, body: draft.body, subject: draft.subject, editedBy: 'model' },
      });
      console.error(`    ✓ draft ${draftRow.id}`);
    } catch (err) {
      console.error(`    ✗ ${String(err).split('\n')[0]}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});

import { z } from 'zod';
import { SOURCE_CLAIM_BASES, type ClientForRelevance, type DraftPayload, type NormalisedEvent, type RelevanceJudgment, type SourceClaim } from './types.js';
import {
  DRAFTER_PROMPT_VERSION,
  drafterSystemPrompt,
  drafterUserPrompt,
} from './prompts.js';
import type { ModelProvider } from './model.js';

const sourceClaimSchema = z.object({
  claim: z.string().min(1),
  basis: z.enum(SOURCE_CLAIM_BASES),
  evidence: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

const draftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  whyThisClient: z.string().min(1),
  recipientEmails: z.array(z.string()).default([]),
  ccEmails: z.array(z.string()).default([]),
  sourceClaims: z.array(sourceClaimSchema).default([]),
});

export async function generateDraft(args: {
  event: NormalisedEvent;
  client: ClientForRelevance;
  judgment: RelevanceJudgment;
  exemplars?: { subject: string; body: string }[];
  model: ModelProvider;
}): Promise<DraftPayload> {
  const { event, client, judgment, exemplars = [], model } = args;
  const system = drafterSystemPrompt(client.ownershipMode);
  const user = drafterUserPrompt({
    event,
    client,
    angle: judgment.angle,
    rationale: judgment.rationale,
    sourceExcerpts: judgment.sourceExcerpts,
    exemplars,
  });

  const first = await model.generateJson<unknown>({
    system,
    user,
    maxTokens: 1800,
    promptVersion: DRAFTER_PROMPT_VERSION,
  });
  const tryFirst = draftSchema.safeParse(first.data);
  let parsed;
  let modelId = first.modelId;
  let promptVersion = first.promptVersion;
  if (tryFirst.success) {
    parsed = tryFirst.data;
  } else {
    const repaired = await model.generateJson<unknown>({
      system,
      user:
        user +
        `\n\nYour previous reply did not match the schema. Validation errors:\n${JSON.stringify(tryFirst.error.flatten().fieldErrors)}\n\nReturn ONLY the corrected JSON object now.`,
      maxTokens: 1800,
      promptVersion: DRAFTER_PROMPT_VERSION + '+repair',
    });
    parsed = draftSchema.parse(repaired.data);
    modelId = repaired.modelId;
    promptVersion = repaired.promptVersion;
  }

  // Recipient routing depends on ownership mode.
  let finalRecipients: string[];
  let finalCc: string[];
  if (client.ownershipMode === 'relationship_partner' && client.relationshipPartner) {
    // The actual outbound email goes to the partner. CC stays empty unless
    // the model proposed something specific.
    finalRecipients = [client.relationshipPartner.email];
    finalCc = parsed.ccEmails;
  } else {
    finalRecipients =
      parsed.recipientEmails.length > 0
        ? parsed.recipientEmails
        : client.primaryRecipients.map((r) => r.email);
    finalCc =
      parsed.ccEmails.length > 0 ? parsed.ccEmails : client.ccRecipients.map((r) => r.email);
  }

  // Canonicalise any Markdown-link URL in the body to the event's source URL.
  // The model occasionally hallucinates a URL (e.g. typo'd domain). The
  // operative-verb hyperlink is the only kind of link the prompt allows in
  // the body, and it must point at the source — so any deviation is wrong.
  const canonicalUrl = event.sourceUrl;
  const cleanBody = parsed.body
    .trim()
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text) => `[${text}](${canonicalUrl})`);

  return {
    subject: parsed.subject.trim(),
    body: cleanBody,
    whyThisClient: parsed.whyThisClient.trim(),
    recipientEmails: finalRecipients,
    ccEmails: finalCc,
    sourceClaims: parsed.sourceClaims,
    promptVersion,
    modelId,
  };
}

import { z } from 'zod';
import type { ClientForRelevance, NormalisedEvent, RelevanceJudgment } from './types.js';
import {
  RELEVANCE_PROMPT_VERSION,
  relevanceSystemPrompt,
  relevanceUserPrompt,
} from './prompts.js';
import type { ModelProvider } from './model.js';

/** Pass 1 — cheap structured screen, runs in TypeScript. */
export function structuredScreen(
  event: NormalisedEvent,
  client: ClientForRelevance,
): { passed: boolean; matched: string[] } {
  const matched: string[] = [];

  const lowerBag = (xs: string[]) => xs.map((x) => x.toLowerCase());
  const eventPartiesL = lowerBag(event.parties);
  const eventSectorsL = lowerBag(event.sectors);
  const eventGeographiesL = lowerBag(event.geographies);
  const haystack = (
    event.title + '\n' + event.summary + '\n' + event.fullText
  ).toLowerCase();

  // Named entities (competitor / customer / supplier / portfolio / theme / phrase)
  for (const e of client.entities) {
    const v = e.value.toLowerCase().trim();
    if (!v) continue;
    if (eventPartiesL.some((p) => p.includes(v) || v.includes(p))) {
      matched.push(`entity:${e.kind}:${e.value}:party`);
      continue;
    }
    if (haystack.includes(v)) {
      matched.push(`entity:${e.kind}:${e.value}:text`);
    }
  }

  // Sector overlap (exact tag match either way)
  for (const s of client.sectorTags.map((x) => x.toLowerCase())) {
    if (!s) continue;
    if (eventSectorsL.includes(s) || haystack.includes(s)) {
      matched.push(`sector:${s}`);
    }
  }

  // Geography overlap
  for (const g of client.geographies.map((x) => x.toLowerCase())) {
    if (!g) continue;
    if (eventGeographiesL.includes(g) || haystack.includes(g)) {
      matched.push(`geography:${g}`);
    }
  }

  return { passed: matched.length > 0, matched };
}

const judgmentSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  tier: z.enum(['high', 'medium', 'low']),
  rationale: z.string().min(1),
  angle: z.string().min(1),
  sourceExcerpts: z.array(z.string()).default([]),
});

/** Pass 2 — Claude judgment for one (event, client) candidate. */
export async function judgeRelevance(
  event: NormalisedEvent,
  client: ClientForRelevance,
  model: ModelProvider,
): Promise<RelevanceJudgment> {
  const system = relevanceSystemPrompt();
  const user = relevanceUserPrompt(event, client);

  const first = await model.generateJson<unknown>({
    system,
    user,
    maxTokens: 800,
    promptVersion: RELEVANCE_PROMPT_VERSION,
  });
  const tryFirst = judgmentSchema.safeParse(first.data);
  let parsed;
  let modelId = first.modelId;
  let promptVersion = first.promptVersion;

  if (tryFirst.success) {
    parsed = tryFirst.data;
  } else {
    // One repair attempt — feed the validation error back as the user message.
    const repaired = await model.generateJson<unknown>({
      system,
      user:
        user +
        `\n\nYour previous reply did not match the schema. Validation errors:\n${JSON.stringify(tryFirst.error.flatten().fieldErrors)}\n\nReturn ONLY the corrected JSON object now.`,
      maxTokens: 800,
      promptVersion: RELEVANCE_PROMPT_VERSION + '+repair',
    });
    parsed = judgmentSchema.parse(repaired.data);
    modelId = repaired.modelId;
    promptVersion = repaired.promptVersion;
  }

  // Defensive: derive tier from threshold if model lies.
  const computed = computeTier(parsed.confidence, client.confidenceThreshold);
  const tier = parsed.tier === computed ? parsed.tier : computed;

  return { ...parsed, tier, modelId, promptVersion };
}

export function computeTier(
  confidence: number,
  threshold: number,
): 'high' | 'medium' | 'low' {
  // Cap so a threshold of 90 doesn't demand 105 for high.
  const highCutoff = Math.min(95, threshold + 15);
  if (confidence >= highCutoff) return 'high';
  if (confidence >= threshold) return 'medium';
  return 'low';
}

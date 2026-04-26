import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin abstraction so swapping providers later is a one-file change.
 * Returns the JSON object parsed from the model's reply.
 */
export interface ModelProvider {
  /** Identifier persisted in relevanceJudgments.modelId / drafts.modelId. */
  id: string;
  generateJson<T>(args: {
    system: string;
    user: string;
    /** Optional max tokens cap. */
    maxTokens?: number;
    /** Stable label for the prompt template, persisted alongside the result. */
    promptVersion: string;
  }): Promise<{ data: T; raw: string; promptVersion: string; modelId: string }>;
}

const DEFAULT_MODEL = 'claude-sonnet-4-5';

export function makeAnthropicProvider(opts?: {
  apiKey?: string;
  model?: string;
}): ModelProvider {
  const model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  // Plain Messages API only. ZDR is an account-level arrangement; do not set
  // a header to imply otherwise.
  // 4 retries with the SDK's exponential backoff covers transient network
  // blips (the SDK retries on 408/429/500/502/503/504/connection errors).
  const client = new Anthropic({ apiKey, maxRetries: 4 });

  return {
    id: model,
    async generateJson<T>(args: {
      system: string;
      user: string;
      maxTokens?: number;
      promptVersion: string;
    }) {
      const { system, user, maxTokens, promptVersion } = args;
      let res;
      try {
        res = await client.messages.create({
          model,
          max_tokens: maxTokens ?? 2000,
          system,
          messages: [{ role: 'user', content: user }],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/model.*not.*found|invalid.*model|404/i.test(msg)) {
          throw new Error(
            `Anthropic rejected model "${model}". Set ANTHROPIC_MODEL to a valid id. Cause: ${msg}`,
          );
        }
        throw err;
      }

      const textBlock = res.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in model response');
      }
      const raw = textBlock.text;
      const data = parseJsonLoose<T>(raw);
      return { data, raw, promptVersion, modelId: model };
    },
  };
}

/**
 * Probe the configured model with a tiny request. Used at worker startup so
 * that a misconfigured ANTHROPIC_MODEL fails loudly within seconds instead
 * of silently failing on the first event.
 */
export async function assertModelReachable(provider: ModelProvider): Promise<void> {
  await provider.generateJson<{ ok: boolean }>({
    system: 'Reply with the JSON object {"ok": true}. Do not write any other text.',
    user: 'health check',
    maxTokens: 30,
    promptVersion: 'health.v1',
  });
}

/** Tolerate model wrapping JSON in ```json fences or trailing prose. */
export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  // direct
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through
  }
  // fenced
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]) as T;
    } catch {
      // fall through
    }
  }
  // first {...} block
  const open = trimmed.indexOf('{');
  const close = trimmed.lastIndexOf('}');
  if (open !== -1 && close !== -1 && close > open) {
    const blob = trimmed.slice(open, close + 1);
    return JSON.parse(blob) as T;
  }
  throw new Error('Could not parse JSON from model response');
}

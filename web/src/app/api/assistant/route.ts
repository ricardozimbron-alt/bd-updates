import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';
import { runTool, TOOL_SPECS, type Proposal, type ToolName } from './tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL ?? 'claude-opus-4-7';
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? '').toLowerCase();

const SYSTEM_PROMPT = `You are the in-app assistant for "BD updates", a personal regulatory monitor.
The user is a single owner who watches UK + EU competition publications and
generates personalised business-development drafts to specific clients.

You can:
  - read clients, drafts, events, rules, and source health
  - explain WHY a draft was generated (the relevance judgment, the angle, the
    rationale, and the source claims grouped by basis)
  - take feedback from the user and translate it into concrete PROPOSALS:
      * amend a client profile narrative
      * change a client's ownership mode (mine vs relationship-partner-led)
      * add a relevance rule (global or per-client) so similar cases are
        captured or excluded next time — proposed rules land as CANDIDATES
        on /rules and the user has to actively promote them
      * dismiss a draft with categories + free-text reasoning
      * mark a draft sent  ← only when the user has explicitly said they
        already sent the email
  - search the public web for context (recent press, parties, sectors).

CRITICAL — propose-and-confirm pattern:
  All write actions go through propose_* tools. These tools DO NOT WRITE the
  database. They surface a proposal card to the user with Approve/Reject
  buttons. Nothing changes until the user clicks Approve.

  When you propose, use language like "I can propose…" or "I'm queuing a
  proposal to…" — never "I've added the rule" or "I dismissed it", because
  you have not. After emitting a proposal, end your reply briefly and let
  the user decide.

  mark_draft_sent in particular is irreversible from the user's mental
  model — they treat it as the canonical record. Only propose it when the
  user has clearly said they already sent the email outside the app.

Other rules:
  - When the user asks "why this draft?", call get_draft for the focused
    draftId, summarise the angle + rationale + source claims in plain English.
  - Be concise. No flattery. No "I'd be happy to". Skip throat-clearing.
  - Never invent client facts. Always pull from get_client first.
  - When you need fresh information from the web (e.g. who acquired whom,
    whether a sector is regulated), use the web_search tool.
  - When the model is uncertain, say so and surface the open question.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  context?: {
    route?: string; // e.g. "/inbox?id=abc"
    selectedDraftId?: string;
    selectedClientId?: string;
  };
}

export async function POST(req: NextRequest) {
  // Auth gate — only the owner.
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.user.email.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const body = (await req.json()) as RequestBody;
  const ctx = body.context ?? {};
  const contextBlock = `Page context (what the user is currently looking at):
  route: ${ctx.route ?? '(unknown)'}
  selectedDraftId: ${ctx.selectedDraftId ?? '(none)'}
  selectedClientId: ${ctx.selectedClientId ?? '(none)'}

If selectedDraftId is set and the user's question is about "this draft" /
"why this client" / similar, prefer get_draft over list_pending_drafts.`;

  const userMessages = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  // Prepend the page-context as a system-style block.
  const messages = [
    { role: 'user' as const, content: contextBlock },
    ...userMessages,
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Tool-use loop. Bound to N steps to avoid runaway.
  const MAX_STEPS = 8;
  const conversation: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalText = '';
  const toolTrace: Array<{ name: string; input: unknown; output: unknown }> = [];
  const proposals: Proposal[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: TOOL_SPECS as unknown as Anthropic.Tool[],
      messages: conversation,
    });

    // Collect any text output as we go.
    const textParts = res.content
      .filter((b: Anthropic.ContentBlock) => b.type === 'text')
      .map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text)
      .join('\n');
    if (textParts) finalText = textParts;

    if (res.stop_reason !== 'tool_use') {
      break;
    }

    // Run the tool calls and append the results.
    const toolUses = res.content.filter(
      (b: Anthropic.ContentBlock) => b.type === 'tool_use',
    ) as Anthropic.ToolUseBlock[];

    conversation.push({ role: 'assistant', content: res.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      let output: unknown;
      try {
        output = await runTool(t.name as ToolName, t.input as Record<string, unknown>);
      } catch (err) {
        output = { error: err instanceof Error ? err.message : String(err) };
      }
      toolTrace.push({ name: t.name, input: t.input, output });
      // Lift any proposal up so the UI can surface it.
      if (
        output &&
        typeof output === 'object' &&
        'proposal' in (output as Record<string, unknown>)
      ) {
        const p = (output as { proposal: Proposal }).proposal;
        proposals.push(p);
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: t.id,
        content: JSON.stringify(output).slice(0, 50_000),
      });
    }
    conversation.push({ role: 'user', content: toolResults });
  }

  return NextResponse.json({
    text: finalText || '(no text returned)',
    proposals,
    toolTrace: toolTrace.map((t) => ({
      name: t.name,
      summary: summariseTool(t.name, t.input, t.output),
    })),
  });
}

function summariseTool(name: string, input: unknown, output: unknown): string {
  // One-line trace surfaced to the UI so the user can see what the assistant
  // actually did, especially for write actions.
  const i = JSON.stringify(input ?? {});
  const o =
    typeof output === 'object' && output !== null && 'ok' in (output as Record<string, unknown>)
      ? '✓'
      : Array.isArray(output)
        ? `array(${output.length})`
        : typeof output === 'object' && output !== null && 'error' in (output as Record<string, unknown>)
          ? '✗ ' + String((output as { error: unknown }).error)
          : 'ok';
  return `${name}(${i.length > 80 ? i.slice(0, 80) + '…' : i}) → ${o}`;
}

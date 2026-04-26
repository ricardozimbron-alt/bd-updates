import { prisma } from '@bdu/lib';

/**
 * Tools the in-app assistant can call. Each tool returns a JSON-serialisable
 * object that gets fed back into the model. Side-effecting tools modify the
 * database; the assistant must surface what changed in its reply.
 */

export type ToolName =
  | 'list_clients'
  | 'get_client'
  | 'list_pending_drafts'
  | 'get_draft'
  | 'list_recent_events'
  | 'list_rules'
  | 'propose_update_client_profile'
  | 'propose_set_client_ownership'
  | 'propose_add_relevance_rule'
  | 'propose_dismiss_draft'
  | 'propose_mark_draft_sent'
  | 'web_search';

/**
 * A proposal the model would like to make. Surfaced to the user via
 * Approve/Reject cards. Nothing is written until the user clicks Approve.
 */
export type Proposal =
  | {
      type: 'update_client_profile';
      summary: string;
      clientId: string;
      narrativeMarkdown: string;
      currentSnippet?: string;
    }
  | {
      type: 'set_client_ownership';
      summary: string;
      clientId: string;
      mode: 'mine' | 'relationship_partner';
      partnerName?: string;
      partnerEmail?: string;
      partnerFirm?: string;
    }
  | {
      type: 'add_relevance_rule';
      summary: string;
      scope: 'global' | 'client';
      clientId?: string;
      rule: string;
    }
  | {
      type: 'dismiss_draft';
      summary: string;
      draftId: string;
      categories?: string[];
      freeText?: string;
      scopeClientSpecific?: boolean;
      scopeCrossClient?: boolean;
    }
  | {
      type: 'mark_draft_sent';
      summary: string;
      draftId: string;
    };

export const TOOL_SPECS = [
  {
    name: 'list_clients',
    description:
      'List all clients with their key fields (name, sectors, geographies, ownership mode, threshold, archived).',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_client',
    description:
      'Fetch one client with profile narrative, contacts, watched entities, prior authority interactions, and active rules.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_pending_drafts',
    description: 'List drafts in pending status (high then medium tier).',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_draft',
    description:
      'Fetch one draft with the underlying event, client, judgment (rationale, angle, source excerpts) and source claims.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_recent_events',
    description: 'List the most-recently detected events across all sources.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_rules',
    description: 'List active relevance rules (global + per-client).',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'propose_update_client_profile',
    description:
      'Propose replacing a client profile narrative (Markdown). DOES NOT WRITE — the user sees the proposal as an Approve/Reject card and must click Approve before anything changes. Always include a "summary" of what is changing and why.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        clientId: { type: 'string' },
        narrativeMarkdown: { type: 'string' },
      },
      required: ['summary', 'clientId', 'narrativeMarkdown'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_set_client_ownership',
    description:
      'Propose changing client ownership mode (mine vs relationship_partner). DOES NOT WRITE — user must approve. Include a "summary".',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        clientId: { type: 'string' },
        mode: { type: 'string', enum: ['mine', 'relationship_partner'] },
        partnerName: { type: 'string' },
        partnerEmail: { type: 'string' },
        partnerFirm: { type: 'string' },
      },
      required: ['summary', 'clientId', 'mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_add_relevance_rule',
    description:
      'Propose a relevance rule. DOES NOT WRITE — the rule is created with status="candidate" only after the user clicks Approve, then visible on /rules awaiting their final review. Include a "summary".',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        scope: { type: 'string', enum: ['global', 'client'] },
        clientId: { type: 'string' },
        rule: { type: 'string' },
      },
      required: ['summary', 'scope', 'rule'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_dismiss_draft',
    description:
      'Propose dismissing a draft. DOES NOT WRITE — user must approve. Include a "summary".',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        draftId: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
        freeText: { type: 'string' },
        scopeClientSpecific: { type: 'boolean' },
        scopeCrossClient: { type: 'boolean' },
      },
      required: ['summary', 'draftId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_mark_draft_sent',
    description:
      'Propose marking a draft as sent. DOES NOT WRITE — the user must explicitly click Approve. Sending an email is irreversible; use sparingly and only when the user clearly told you they have already sent it.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        draftId: { type: 'string' },
      },
      required: ['summary', 'draftId'],
      additionalProperties: false,
    },
  },
  // Anthropic-managed web search tool. The Anthropic SDK runs it server-side.
  {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 5,
  },
] as const;

export async function runTool(name: ToolName, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_clients': {
      const cs = await prisma.client.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          displayName: true,
          sectorTags: true,
          geographies: true,
          ownershipMode: true,
          relationshipPartnerName: true,
          relationshipPartnerEmail: true,
          confidenceThreshold: true,
          archived: true,
        },
      });
      return cs;
    }
    case 'get_client': {
      const id = String(input.id);
      const c = await prisma.client.findUnique({
        where: { id },
        include: { profile: true, contacts: true, entities: true, interactions: true, rules: true },
      });
      return c ?? { error: 'not found' };
    }
    case 'list_pending_drafts': {
      const limit = Number(input.limit ?? 25);
      const ds = await prisma.draft.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          client: { select: { id: true, displayName: true, ownershipMode: true } },
          event: { select: { title: true, eventType: true, authority: true, sourceUrl: true } },
          judgment: { select: { tier: true, confidence: true, angle: true } },
        },
      });
      return ds;
    }
    case 'get_draft': {
      const id = String(input.id);
      const d = await prisma.draft.findUnique({
        where: { id },
        include: {
          client: { include: { profile: true, contacts: true, entities: true } },
          event: true,
          judgment: true,
          versions: { orderBy: { editedAt: 'desc' }, take: 5 },
        },
      });
      return d ?? { error: 'not found' };
    }
    case 'list_recent_events': {
      const limit = Number(input.limit ?? 25);
      const es = await prisma.event.findMany({
        orderBy: { detectedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          authority: true,
          eventType: true,
          publishedAt: true,
          detectedAt: true,
          processingStatus: true,
          sourceUrl: true,
          summary: true,
        },
      });
      return es;
    }
    case 'list_rules': {
      const rs = await prisma.clientRelevanceRule.findMany({
        where: { active: true },
        include: { client: { select: { id: true, displayName: true } } },
        orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }],
      });
      return rs;
    }
    case 'propose_update_client_profile': {
      const clientId = String(input.clientId);
      const narrativeMarkdown = String(input.narrativeMarkdown ?? '');
      const summary = String(input.summary ?? 'Update client profile');
      const current = await prisma.clientProfile.findUnique({ where: { clientId } });
      const proposal: Proposal = {
        type: 'update_client_profile',
        summary,
        clientId,
        narrativeMarkdown,
        currentSnippet: current?.narrativeMarkdown.slice(0, 240),
      };
      return {
        proposal,
        message:
          'PROPOSAL emitted to the user. Wait for them to Approve before assuming it is done.',
      };
    }
    case 'propose_set_client_ownership': {
      const mode = String(input.mode);
      if (mode !== 'mine' && mode !== 'relationship_partner') {
        return { error: 'invalid mode' };
      }
      const proposal: Proposal = {
        type: 'set_client_ownership',
        summary: String(input.summary ?? 'Change ownership mode'),
        clientId: String(input.clientId),
        mode,
        partnerName: input.partnerName as string | undefined,
        partnerEmail: input.partnerEmail as string | undefined,
        partnerFirm: input.partnerFirm as string | undefined,
      };
      return {
        proposal,
        message: 'PROPOSAL emitted. Awaiting user approval.',
      };
    }
    case 'propose_add_relevance_rule': {
      const scope = String(input.scope);
      const rule = String(input.rule ?? '').trim();
      if (!rule) return { error: 'rule text empty' };
      if (scope !== 'global' && scope !== 'client') return { error: 'invalid scope' };
      const proposal: Proposal = {
        type: 'add_relevance_rule',
        summary: String(input.summary ?? 'Add relevance rule'),
        scope,
        clientId: input.clientId as string | undefined,
        rule,
      };
      return {
        proposal,
        message:
          'PROPOSAL emitted. On approval the rule is created with status=candidate; the user still has to actively confirm it on /rules before it goes live.',
      };
    }
    case 'propose_dismiss_draft': {
      const proposal: Proposal = {
        type: 'dismiss_draft',
        summary: String(input.summary ?? 'Dismiss draft'),
        draftId: String(input.draftId),
        categories: (input.categories as string[] | undefined) ?? [],
        freeText: input.freeText as string | undefined,
        scopeClientSpecific: Boolean(input.scopeClientSpecific),
        scopeCrossClient: Boolean(input.scopeCrossClient),
      };
      return { proposal, message: 'PROPOSAL emitted. Awaiting user approval.' };
    }
    case 'propose_mark_draft_sent': {
      const proposal: Proposal = {
        type: 'mark_draft_sent',
        summary: String(input.summary ?? 'Mark draft sent'),
        draftId: String(input.draftId),
      };
      return {
        proposal,
        message:
          'PROPOSAL emitted. Marking sent is irreversible; only the user can confirm.',
      };
    }
    case 'web_search':
      // Anthropic-managed: handled inside the SDK call; runTool is never
      // called for this tool name.
      return { error: 'web_search is handled server-side by the model' };
  }
}

// Cross-package shared types. Kept deliberately small so swapping
// providers or storage layers stays a one-file change.

export const EVENT_TYPES = [
  // CMA mergers
  'CMA_INVITATION_TO_COMMENT',
  'CMA_PHASE1_DECISION',
  'CMA_PHASE2_REFERENCE',
  'CMA_PHASE2_INTERIM_REPORT',
  'CMA_REMEDIES_CONSULTATION',
  'CMA_PHASE2_FINAL_DECISION',
  'CMA_UNDERTAKINGS_UPDATE',
  // EC mergers
  'EC_MERGER_NOTIFIED',
  'EC_PHASE1_PRESS_RELEASE',
  'EC_PHASE1_DECISION_PUBLISHED',
  'EC_PHASE2_OPENING',
  'EC_PHASE2_PRESS_RELEASE',
  'EC_PHASE2_DECISION_PUBLISHED',
  'EC_COMMITMENTS_PUBLISHED',
  // Consumer & adjacent
  'CONSUMER_ENFORCEMENT_ACTION',
  'CONSUMER_GUIDANCE',
  'CONSUMER_SWEEP',
  'MARKET_INVESTIGATION',
  'DMCC_DESIGNATION',
  'DMCC_CONDUCT_REQUIREMENT',
  'ANTITRUST_ENFORCEMENT',
  'JUDGMENT',
  'CONSULTATION',
  'OTHER',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const AUTHORITIES = ['CMA', 'EC', 'OTHER'] as const;
export type Authority = (typeof AUTHORITIES)[number];

export type RelevanceTier = 'high' | 'medium' | 'low';

/**
 * The normalised event a Source adapter must produce. The worker uses these
 * to upsert into the events table, deduped by contentHash.
 */
export interface NormalisedEvent {
  authority: Authority;
  sourceUrl: string;
  caseRef?: string | null;
  eventType: EventType;
  title: string;
  summary: string;
  fullText: string;
  parties: string[];
  sectors: string[];
  geographies: string[];
  publishedAt: Date;
  attachmentUrls: string[];
  /** SHA-256 over normalised content. Used for dedupe. */
  contentHash: string;
}

export type OwnershipMode = 'mine' | 'relationship_partner';

export interface ClientForRelevance {
  id: string;
  name: string;
  displayName: string;
  sectorTags: string[];
  geographies: string[];
  confidenceThreshold: number;
  tonePreference: string | null;
  narrativeMarkdown: string | null;
  /** Whether I lead the relationship (mine) or a partner does (relationship_partner). */
  ownershipMode: OwnershipMode;
  /** Set only when ownershipMode = relationship_partner. */
  relationshipPartner?: {
    name: string;
    email: string;
    firm: string | null;
  } | null;
  entities: { kind: string; value: string; notes: string | null }[];
  authorityInteractions: {
    authority: string;
    caseRef: string | null;
    year: number | null;
    summary: string;
  }[];
  rules: string[]; // active rule texts (client + global)
  primaryRecipients: { name: string; email: string; role: string | null }[];
  ccRecipients: { name: string; email: string; role: string | null }[];
}

export interface RelevanceJudgment {
  relevant: boolean;
  confidence: number; // 0-100
  tier: RelevanceTier;
  rationale: string;
  angle: string;
  sourceExcerpts: string[];
  promptVersion: string;
  modelId: string;
}

export const SOURCE_CLAIM_BASES = [
  'source_publication',
  'client_profile',
  'authority_interaction',
  'inference',
] as const;
export type SourceClaimBasis = (typeof SOURCE_CLAIM_BASES)[number];

export interface SourceClaim {
  /** Verbatim phrase from the draft body. */
  claim: string;
  /** Where the claim is grounded. */
  basis: SourceClaimBasis;
  /** Verbatim evidence string (e.g. excerpt from event.fullText, profile line, prior-interaction summary). */
  evidence: string;
  /** URL the evidence is linkable to, where applicable (event.sourceUrl). */
  sourceUrl?: string;
}

export interface DraftPayload {
  subject: string;
  body: string;
  /**
   * Internal-only narrative the drafter writes in plain English explaining,
   * across two short paragraphs, why this client was selected for this event.
   * Mechanistic and exhaustive is fine — surfaced in the inbox so the user
   * can spot-check the selection. Never copied to clipboard, never sent.
   */
  whyThisClient: string;
  recipientEmails: string[];
  ccEmails: string[];
  sourceClaims: SourceClaim[];
  promptVersion: string;
  modelId: string;
}

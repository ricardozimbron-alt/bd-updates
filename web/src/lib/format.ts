export function relativeTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const sec = (Date.now() - date.getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604_800) return `${Math.floor(sec / 86_400)}d`;
  return date.toISOString().slice(0, 10);
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  CMA_INVITATION_TO_COMMENT: 'CMA · invitation to comment',
  CMA_PHASE1_DECISION: 'CMA · Phase 1 decision',
  CMA_PHASE2_REFERENCE: 'CMA · Phase 2 reference',
  CMA_PHASE2_INTERIM_REPORT: 'CMA · Phase 2 interim',
  CMA_REMEDIES_CONSULTATION: 'CMA · remedies consultation',
  CMA_PHASE2_FINAL_DECISION: 'CMA · Phase 2 final',
  CMA_UNDERTAKINGS_UPDATE: 'CMA · undertakings',
  EC_MERGER_NOTIFIED: 'EC · merger notified',
  EC_PHASE1_PRESS_RELEASE: 'EC · Phase 1 press',
  EC_PHASE1_DECISION_PUBLISHED: 'EC · Phase 1 decision',
  EC_PHASE2_OPENING: 'EC · Phase 2 opening',
  EC_PHASE2_PRESS_RELEASE: 'EC · Phase 2 press',
  EC_PHASE2_DECISION_PUBLISHED: 'EC · Phase 2 decision',
  EC_COMMITMENTS_PUBLISHED: 'EC · commitments',
  CONSUMER_ENFORCEMENT_ACTION: 'Consumer · enforcement',
  CONSUMER_GUIDANCE: 'Consumer · guidance',
  CONSUMER_SWEEP: 'Consumer · sweep',
  MARKET_INVESTIGATION: 'Market investigation',
  DMCC_DESIGNATION: 'DMCC · designation',
  DMCC_CONDUCT_REQUIREMENT: 'DMCC · conduct requirement',
  ANTITRUST_ENFORCEMENT: 'Antitrust enforcement',
  JUDGMENT: 'Judgment',
  CONSULTATION: 'Consultation',
  OTHER: 'Other',
};

export function eventTypeLabel(t: string): string {
  return EVENT_TYPE_LABEL[t] ?? t;
}

export function tierClass(tier: string): string {
  if (tier === 'high') return 'tier-high';
  if (tier === 'medium') return 'tier-medium';
  return 'tier-low';
}

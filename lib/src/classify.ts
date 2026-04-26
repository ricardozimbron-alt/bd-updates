import type { EventType } from './types.js';

/**
 * Classify a CMA case page (raw HTML body + metadata) into a milestone event.
 * Falls back to OTHER when no milestone marker is found.
 */
export function classifyCmaPage(args: {
  caseType?: string | null;
  caseState?: string | null;
  body: string; // raw HTML
}): EventType {
  const text = args.body.toLowerCase();
  const caseType = (args.caseType ?? '').toLowerCase();

  if (caseType.includes('merger')) {
    if (/undertakings\b/.test(text)) return 'CMA_UNDERTAKINGS_UPDATE';
    if (/final report|final decision|final findings/.test(text)) return 'CMA_PHASE2_FINAL_DECISION';
    if (/remedies (?:notice|consultation|working paper)/.test(text)) return 'CMA_REMEDIES_CONSULTATION';
    if (/provisional findings|interim report/.test(text)) return 'CMA_PHASE2_INTERIM_REPORT';
    if (/refer(?:red|s|ence)?[^.]{0,80}\bphase 2\b|phase 2 reference|reference to (?:a )?phase 2/.test(text)) return 'CMA_PHASE2_REFERENCE';
    if (/phase 1 decision|decision on reference|decision under section 33|decision under section 22|sloc decision/.test(text)) return 'CMA_PHASE1_DECISION';
    if (/invitation to comment|invites comments|inviting comments|invites views/.test(text)) return 'CMA_INVITATION_TO_COMMENT';
    return 'CMA_INVITATION_TO_COMMENT';
  }

  if (caseType.includes('market')) return 'MARKET_INVESTIGATION';
  if (caseType.includes('consumer')) {
    if (/sweep/.test(text)) return 'CONSUMER_SWEEP';
    if (/guidance/.test(text)) return 'CONSUMER_GUIDANCE';
    return 'CONSUMER_ENFORCEMENT_ACTION';
  }
  if (caseType.includes('antitrust') || caseType.includes('ca98')) return 'ANTITRUST_ENFORCEMENT';
  if (caseType.includes('digital-markets') || caseType.includes('dmcc')) {
    if (/conduct requirement/.test(text)) return 'DMCC_CONDUCT_REQUIREMENT';
    return 'DMCC_DESIGNATION';
  }
  if (caseType.includes('consultation')) return 'CONSULTATION';

  return 'OTHER';
}

/** Best-effort extraction of merging parties from a CMA case title. */
export function partiesFromCmaTitle(title: string): string[] {
  // Titles are like "eBay / Depop merger inquiry" or
  // "Hays / Polka Dot and Hays / Millington merger inquiries".
  const stripped = title
    .replace(/merger inquir(?:y|ies)/gi, '')
    .replace(/\bcma\b/gi, '')
    .trim();
  return stripped
    .split(/\s+(?:and|&)\s+|\s*\/\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Classify an EC press release by IP/MEX/STATEMENT type and headline keywords. */
export function classifyEcPress(headline: string): EventType {
  const t = headline.toLowerCase();
  if (/clears.*acquisition|approves.*acquisition|approves.*merger|clears.*merger/.test(t))
    return 'EC_PHASE1_PRESS_RELEASE';
  if (/in-depth investigation|opens in-depth/.test(t)) return 'EC_PHASE2_OPENING';
  if (/prohibits/.test(t)) return 'EC_PHASE2_PRESS_RELEASE';
  if (/commitments/.test(t)) return 'EC_COMMITMENTS_PUBLISHED';
  if (/fines|sanctions|antitrust|cartel/.test(t)) return 'ANTITRUST_ENFORCEMENT';
  if (/judgment|court of justice|general court/.test(t)) return 'JUDGMENT';
  if (/consultation/.test(t)) return 'CONSULTATION';
  return 'OTHER';
}

/** Strip HTML tags for cheap text extraction. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

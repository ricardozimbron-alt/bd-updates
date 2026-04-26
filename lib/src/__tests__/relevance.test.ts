import { describe, expect, it } from 'vitest';
import { computeTier, structuredScreen } from '../relevance.js';
import type { ClientForRelevance, NormalisedEvent } from '../types.js';

const event: NormalisedEvent = {
  authority: 'CMA',
  sourceUrl: 'https://www.gov.uk/cma-cases/ebay-slash-depop-merger-inquiry',
  caseRef: 'cma-cases/ebay-slash-depop-merger-inquiry',
  eventType: 'CMA_INVITATION_TO_COMMENT',
  title: 'eBay / Depop merger inquiry',
  summary: 'CMA seeking views on the anticipated acquisition by eBay Inc. of Depop Limited.',
  fullText:
    'The Competition and Markets Authority (CMA) is seeking views on the anticipated acquisition by eBay Inc. of Depop Limited. Online marketplace, two-sided platform.',
  parties: ['eBay', 'Depop'],
  sectors: ['clothing-footwear-and-fashion'],
  geographies: ['UK'],
  publishedAt: new Date('2026-04-23T07:00:55Z'),
  attachmentUrls: [],
  contentHash: 'abc',
};

const client: ClientForRelevance = {
  id: 'c1',
  name: 'Acme',
  displayName: 'Acme',
  sectorTags: ['retail', 'e-commerce'],
  geographies: ['UK'],
  confidenceThreshold: 60,
  tonePreference: null,
  narrativeMarkdown: null,
  ownershipMode: 'mine',
  relationshipPartner: null,
  entities: [{ kind: 'competitor', value: 'eBay', notes: null }],
  authorityInteractions: [],
  rules: [],
  primaryRecipients: [],
  ccRecipients: [],
};

describe('structuredScreen', () => {
  it('passes when a watched competitor name is in the parties', () => {
    const r = structuredScreen(event, client);
    expect(r.passed).toBe(true);
    expect(r.matched.some((m) => m.startsWith('entity:competitor:eBay'))).toBe(true);
  });

  it('passes on a substring sector match in event content', () => {
    // The screen is deliberately liberal — a substring match in event content
    // is enough. "fashion" is a substring of "clothing-footwear-and-fashion".
    const c = { ...client, entities: [], sectorTags: ['fashion'] };
    expect(structuredScreen(event, c).passed).toBe(true);
  });

  it('passes when a watched theme matches in the body', () => {
    const c = {
      ...client,
      entities: [{ kind: 'watched_theme', value: 'two-sided platform', notes: null }],
      sectorTags: [],
    };
    expect(structuredScreen(event, c).passed).toBe(true);
  });

  it('fails on no overlap', () => {
    const c = { ...client, entities: [], sectorTags: ['mining'], geographies: ['South America'] };
    expect(structuredScreen(event, c).passed).toBe(false);
  });
});

describe('computeTier', () => {
  it('high when confidence >= threshold + 15', () => {
    expect(computeTier(80, 60)).toBe('high');
    expect(computeTier(75, 60)).toBe('high');
    expect(computeTier(74, 60)).toBe('medium');
  });
  it('medium when between threshold and threshold + 15', () => {
    expect(computeTier(60, 60)).toBe('medium');
    expect(computeTier(70, 60)).toBe('medium');
  });
  it('low when below threshold', () => {
    expect(computeTier(59, 60)).toBe('low');
    expect(computeTier(0, 60)).toBe('low');
  });
});

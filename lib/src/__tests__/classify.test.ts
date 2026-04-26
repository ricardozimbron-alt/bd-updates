import { describe, expect, it } from 'vitest';
import { classifyCmaPage, classifyEcPress, partiesFromCmaTitle } from '../classify.js';
import { buildContentHash } from '../hash.js';

describe('classifyCmaPage', () => {
  it('classifies an invitation to comment', () => {
    expect(
      classifyCmaPage({
        caseType: 'mergers',
        caseState: 'open',
        body: '<p>The CMA is issuing this invitation to comment …</p>',
      }),
    ).toBe('CMA_INVITATION_TO_COMMENT');
  });

  it('classifies a Phase 1 decision', () => {
    expect(
      classifyCmaPage({
        caseType: 'mergers',
        caseState: 'closed',
        body: '<p>The CMA has issued its phase 1 decision …</p>',
      }),
    ).toBe('CMA_PHASE1_DECISION');
  });

  it('classifies a Phase 2 reference', () => {
    expect(
      classifyCmaPage({
        caseType: 'mergers',
        caseState: 'open',
        body: '<p>The CMA has decided to refer the merger to a Phase 2 inquiry…</p>',
      }),
    ).toBe('CMA_PHASE2_REFERENCE');
  });

  it('classifies undertakings updates', () => {
    expect(
      classifyCmaPage({
        caseType: 'mergers',
        caseState: 'closed',
        body: '<p>final undertakings accepted …</p>',
      }),
    ).toBe('CMA_UNDERTAKINGS_UPDATE');
  });

  it('falls back to MARKET_INVESTIGATION for markets cases', () => {
    expect(classifyCmaPage({ caseType: 'markets', caseState: 'open', body: '' })).toBe(
      'MARKET_INVESTIGATION',
    );
  });
});

describe('classifyEcPress', () => {
  it('classifies a Phase 1 clearance', () => {
    expect(classifyEcPress("Commission approves Google's acquisition of Wiz")).toBe(
      'EC_PHASE1_PRESS_RELEASE',
    );
  });
  it('classifies a Phase 2 opening', () => {
    expect(classifyEcPress('Commission opens in-depth investigation into …')).toBe(
      'EC_PHASE2_OPENING',
    );
  });
  it('classifies a fine as antitrust enforcement', () => {
    expect(classifyEcPress('Commission fines four banks for cartel conduct')).toBe(
      'ANTITRUST_ENFORCEMENT',
    );
  });
});

describe('partiesFromCmaTitle', () => {
  it('splits on slashes and "and"', () => {
    expect(partiesFromCmaTitle('eBay / Depop merger inquiry')).toEqual(['eBay', 'Depop']);
    expect(partiesFromCmaTitle('Hays / Polka Dot and Hays / Millington merger inquiries')).toEqual([
      'Hays',
      'Polka Dot',
      'Hays',
      'Millington',
    ]);
  });
});

describe('buildContentHash', () => {
  it('is stable across re-fetches with the same identity', () => {
    const a = buildContentHash({
      authority: 'CMA',
      caseRef: 'x',
      eventType: 'CMA_INVITATION_TO_COMMENT',
      title: 'eBay / Depop merger inquiry',
      publishedAt: new Date('2026-04-23T06:00:55Z'),
    });
    const b = buildContentHash({
      authority: 'CMA',
      caseRef: 'x',
      eventType: 'CMA_INVITATION_TO_COMMENT',
      title: '  eBay / Depop merger inquiry  ', // whitespace variant
      publishedAt: new Date('2026-04-23T20:00:55Z'), // same UTC date
    });
    expect(a).toBe(b);
  });

  it('differs across event types', () => {
    const a = buildContentHash({
      authority: 'CMA',
      caseRef: 'x',
      eventType: 'CMA_INVITATION_TO_COMMENT',
      title: 'X / Y merger inquiry',
      publishedAt: new Date('2026-04-23'),
    });
    const b = buildContentHash({
      authority: 'CMA',
      caseRef: 'x',
      eventType: 'CMA_PHASE1_DECISION',
      title: 'X / Y merger inquiry',
      publishedAt: new Date('2026-04-23'),
    });
    expect(a).not.toBe(b);
  });
});

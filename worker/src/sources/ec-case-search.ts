import { existsSync } from 'node:fs';
import {
  buildContentHash,
  type EventType,
  type NormalisedEvent,
  type Source,
  type SourcePollResult,
} from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';

const log = makeLogger('ec-case-search');

const LATEST_URL = 'https://competition-cases.ec.europa.eu/latest-updates/M';

/**
 * Headless-browser scrape of the EC competition case search "latest updates"
 * stream for mergers (policy area M). The page is an Angular SPA with no
 * public API; the only reliable route is to render it.
 *
 * Detects:
 *   - EC_MERGER_NOTIFIED       (notification publication / "prior notification")
 *   - EC_PHASE1_DECISION_PUBLISHED  (Article 6 final decisions)
 *   - EC_PHASE2_DECISION_PUBLISHED  (Article 8 final decisions)
 *   - EC_COMMITMENTS_PUBLISHED      (commitments / Article 6(2) / 8(2))
 */
export interface EcCaseSearchOptions {
  /** Override the path to the Chromium binary. */
  executablePath?: string;
  /** Cap how many cases we extract per poll. */
  maxItems?: number;
  /** Override timeout in ms. */
  timeoutMs?: number;
}

export function makeEcCaseSearchSource(opts: EcCaseSearchOptions = {}): Source {
  return {
    id: 'ec-case-search',
    label: 'EC merger case search (latest updates)',
    pollIntervalMs: 15 * 60 * 1000,
    poll: () => poll(opts),
  };
}

interface RawCase {
  caseRef: string;
  url: string;
  title: string;
  decisionDate: string;
  decisionTypes: string[];
  publicationDate?: string;
}

async function poll(opts: EcCaseSearchOptions): Promise<SourcePollResult> {
  // Lazy-load playwright-core so the rest of the worker doesn't carry the
  // weight when this adapter is disabled.
  const { chromium } = await import('playwright-core');

  const executablePath =
    opts.executablePath ??
    process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    process.env.CHROME_PATH ??
    detectChromePath();

  if (!executablePath) {
    return {
      events: [],
      note: 'no Chromium binary found (set PLAYWRIGHT_CHROMIUM_PATH)',
    };
  }

  const timeoutMs = opts.timeoutMs ?? 45_000;
  const maxItems = opts.maxItems ?? 25;

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      viewport: { width: 1280, height: 1800 },
    });
    const page = await ctx.newPage();

    page.setDefaultTimeout(timeoutMs);
    await page.goto(LATEST_URL, { waitUntil: 'networkidle', timeout: timeoutMs });

    // The list renders into a table or a list of cards. Wait for a row that
    // looks like a case (has the CASE-XXXX format or a date column).
    await page
      .waitForSelector('a[href*="/cases/"], tr, [class*="case"]', { timeout: timeoutMs })
      .catch(() => {});

    // Extract case rows from the SPA. The list renders each case as a
    // flex row containing: <a> with the M.<n> case ref, a sibling div with
    // the title (".eui-u-f-bold"), and one or more <em> status tags
    // ("Ongoing", "Simplified", "Decision adopted", "Cleared with
    // commitments", "Phase II", "Prohibited", etc).
    //
    // The function is passed as a string source so tsx's helper injection
    // (`__name`) does not leak into the browser. We wrap-and-call so the
    // expression resolves to the array.
    const evalSrc = `(() => {
      const out = [];
      const seen = new Set();
      const anchors = document.querySelectorAll('a[href*="/cases/"]');
      anchors.forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (!/\\/cases\\//.test(href)) return;
        const refText = (a.textContent || '').trim();
        const m = /M\\.[0-9]+/.exec(refText);
        const caseRef = m ? m[0] : (href.split('/').pop() || '').split('?')[0];
        if (!caseRef || seen.has(caseRef)) return;
        seen.add(caseRef);
        const row = a.closest('div[fxlayout]') || a.closest('tr') || a.closest('li') || a.parentElement;
        const titleEl = row && row.querySelector('.eui-u-f-bold');
        const title = titleEl ? (titleEl.textContent || '').trim() : '';
        const tagEls = row ? Array.from(row.querySelectorAll('em')) : [];
        const tags = tagEls.map(function (e) { return (e.textContent || '').trim(); }).filter(Boolean);
        const dateMatch = href.match(/dateHighlight=([0-9-]+)/);
        const url = href.startsWith('http')
          ? href
          : 'https://competition-cases.ec.europa.eu' + (href.startsWith('/') ? '' : '/') + href;
        out.push({
          caseRef,
          url,
          title,
          decisionDate: dateMatch ? dateMatch[1] : '',
          decisionTypes: tags,
        });
      });
      return out;
    })()`;
    const cases = (await page.evaluate(evalSrc)) as RawCase[];

    if (cases.length === 0) {
      return {
        events: [],
        note: 'page rendered but no case rows detected (markup may have changed)',
      };
    }

    const events: NormalisedEvent[] = [];
    for (const c of cases.slice(0, maxItems)) {
      const eventType = pickEventType(c.decisionTypes, c.title);
      const publishedAt = parseDate(c.decisionDate) ?? new Date();
      const parties = extractParties(c.title);
      const contentHash = buildContentHash({
        authority: 'EC',
        caseRef: c.caseRef,
        eventType,
        title: c.title,
        publishedAt,
      });
      events.push({
        authority: 'EC',
        sourceUrl: c.url,
        caseRef: c.caseRef,
        eventType,
        title: c.title || c.caseRef,
        summary: c.decisionTypes.join(', ') || c.title,
        fullText: c.title,
        parties,
        sectors: [],
        geographies: ['EU'],
        publishedAt,
        attachmentUrls: [],
        contentHash,
      });
    }
    return {
      events,
      note: `headless render of latest-updates/M; ${events.length} cases`,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function pickEventType(decisionTypes: string[], title: string): EventType {
  // The SPA displays one or more status tags per case. Common values:
  //   "Ongoing", "Simplified", "Super-simplified"  → notification (Phase 1
  //                                                  pending decision)
  //   "Decision adopted"                            → Phase 1 decision
  //   "Cleared with commitments"                    → commitments (Phase 1)
  //   "Phase II", "Phase II decision"               → Phase 2 in progress
  //   "Phase II commitments"                        → commitments (Phase 2)
  //   "Phase II decision adopted"                   → Phase 2 decision
  //   "Prohibited"                                  → Phase 2 decision
  //   "Withdrawn"                                   → notification cycle ended
  const tags = decisionTypes.map((t) => t.toLowerCase());
  const has = (re: RegExp) => tags.some((t) => re.test(t)) || re.test(title.toLowerCase());

  if (has(/phase\s*ii/) || has(/phase\s*2/)) {
    if (has(/commitment/)) return 'EC_COMMITMENTS_PUBLISHED';
    if (has(/decision|prohibit|cleared/)) return 'EC_PHASE2_DECISION_PUBLISHED';
    return 'EC_PHASE2_OPENING';
  }
  if (has(/cleared with commitments|commitments?/)) return 'EC_COMMITMENTS_PUBLISHED';
  if (has(/decision adopted|cleared|approved/)) return 'EC_PHASE1_DECISION_PUBLISHED';
  if (has(/prohibit/)) return 'EC_PHASE2_DECISION_PUBLISHED';
  // "Ongoing", "Simplified", "Super-simplified", "Withdrawn", or no tag at
  // all all map to a notification — it's the right tier-of-information
  // even when the case ends up being withdrawn rather than decided.
  return 'EC_MERGER_NOTIFIED';
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function extractParties(title: string): string[] {
  // Cases are usually titled like "M.10812 Acquirer / Target" or
  // "M.10812 — Acquirer / Target".
  const cleaned = title.replace(/^M\.[0-9]+\s*[-—]?\s*/i, '').trim();
  return cleaned
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function detectChromePath(): string | null {
  // macOS dev path
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

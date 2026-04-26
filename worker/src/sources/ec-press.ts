import {
  buildContentHash,
  classifyEcPress,
  type EventType,
  type NormalisedEvent,
  type Source,
  type SourcePollResult,
} from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';
import { fetchPolitely } from './http.js';

const log = makeLogger('ec-press');

const LISTING_URLS = [
  'https://competition-policy.ec.europa.eu/mergers/latest-news_en',
  'https://competition-policy.ec.europa.eu/antitrust-and-cartels/latest-news_en',
  'https://competition-policy.ec.europa.eu/state-aid/latest-news_en',
  'https://competition-policy.ec.europa.eu/foreign-subsidies-regulation/latest-news_en',
];

interface ListingCard {
  url: string;
  title: string;
  publishedAt: Date;
  kind: string; // "Press release" | "News" | …
  area: 'mergers' | 'antitrust' | 'state-aid' | 'fsr' | 'other';
}

export function makeEcPressSource(): Source {
  return {
    id: 'ec-press',
    label: 'EC Press Corner (DG COMP)',
    pollIntervalMs: 10 * 60 * 1000,
    poll,
  };
}

async function poll(): Promise<SourcePollResult> {
  const allCards: ListingCard[] = [];
  for (const url of LISTING_URLS) {
    try {
      const cards = await fetchListing(url);
      allCards.push(...cards);
    } catch (err) {
      log.warn('listing failed', { url, err: String(err) });
    }
  }

  // De-dup cards by url across listings (a card can appear in multiple).
  const byUrl = new Map<string, ListingCard>();
  for (const c of allCards) {
    if (!byUrl.has(c.url)) byUrl.set(c.url, c);
  }

  const events: NormalisedEvent[] = [];
  for (const card of byUrl.values()) {
    try {
      const e = await buildEventFromCard(card);
      if (e) events.push(e);
    } catch (err) {
      log.warn('detail fetch failed', { url: card.url, err: String(err) });
    }
  }

  return {
    events,
    note: `scraped ${allCards.length} listing entries; ${byUrl.size} unique; ${events.length} events`,
  };
}

async function fetchListing(url: string): Promise<ListingCard[]> {
  const res = await fetchPolitely(url, { accept: 'html' });
  if (!res.ok) return [];
  const html = await res.text();

  const area = areaFromUrl(url);
  const cards: ListingCard[] = [];
  // Pull each <article ...class="ecl-content-item">…</article>
  const re = /<article[^>]*class="[^"]*ecl-content-item[^"]*"[\s\S]*?<\/article>/g;
  for (const m of html.matchAll(re)) {
    const block = m[0];
    const titleM = /<a[^>]+href="([^"]+)"[^>]+data-ecl-title-link[^>]*>([^<]+)<\/a>/.exec(block);
    if (!titleM) continue;
    const linkUrl = decodeHtml(titleM[1]!);
    const title = decodeHtml(titleM[2]!).trim();
    const dateM = /<time[^>]+datetime="([^"]+)"/.exec(block);
    const publishedAt = dateM ? new Date(dateM[1]!) : new Date();
    const kindM = /<li class="ecl-content-block__primary-meta-item">([^<]+)<\/li>/.exec(block);
    const kind = (kindM?.[1] ?? '').trim();
    if (!linkUrl || !title) continue;
    cards.push({ url: linkUrl, title, publishedAt, kind, area });
  }
  return cards;
}

function areaFromUrl(u: string): ListingCard['area'] {
  if (u.includes('/mergers/')) return 'mergers';
  if (u.includes('/antitrust-and-cartels/')) return 'antitrust';
  if (u.includes('/state-aid/')) return 'state-aid';
  if (u.includes('/foreign-subsidies-regulation/')) return 'fsr';
  return 'other';
}

async function buildEventFromCard(card: ListingCard): Promise<NormalisedEvent | null> {
  // Press corner detail pages are JS-rendered, but title+meta description are
  // server-side for SEO. We use those as the event payload. The user opens
  // the source URL to read the full press release.
  let metaDescription = '';
  let metaTitle = card.title;
  try {
    const res = await fetchPolitely(card.url, { accept: 'html' });
    if (res.ok) {
      const html = await res.text();
      metaDescription = extractMeta(html, 'description') ?? '';
      const ogTitle = extractMeta(html, 'twitter:title') ?? extractMeta(html, 'og:title');
      if (ogTitle) metaTitle = ogTitle;
    }
  } catch {
    // ignore — we still have the listing card payload
  }

  const eventType = pickEventType(metaTitle, card);
  const caseRef = extractRef(card.url);

  const fullText = metaDescription || card.title;
  const summary = metaDescription || card.title;

  const contentHash = buildContentHash({
    authority: 'EC',
    caseRef,
    eventType,
    title: metaTitle,
    publishedAt: card.publishedAt,
  });

  return {
    authority: 'EC',
    sourceUrl: card.url,
    caseRef,
    eventType,
    title: metaTitle,
    summary,
    fullText,
    parties: extractPartiesFromTitle(metaTitle),
    sectors: [],
    geographies: ['EU'],
    publishedAt: card.publishedAt,
    attachmentUrls: [],
    contentHash,
  };
}

function pickEventType(title: string, card: ListingCard): EventType {
  const fromHead = classifyEcPress(title);
  if (fromHead !== 'OTHER') return fromHead;
  if (card.area === 'mergers') return 'EC_PHASE1_PRESS_RELEASE';
  if (card.area === 'antitrust') return 'ANTITRUST_ENFORCEMENT';
  if (card.area === 'state-aid') return 'OTHER';
  if (card.area === 'fsr') return 'OTHER';
  return 'OTHER';
}

function extractRef(url: string): string | null {
  const m = /\/detail\/[a-z]{2}\/([a-z0-9_]+)$/i.exec(url);
  return m?.[1] ?? null;
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]*(?:name|property)="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*content="([^"]*)"`,
    'i',
  );
  const m = re.exec(html);
  return m ? decodeHtml(m[1]!) : null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  Eacute: 'É',
  egrave: 'è',
  Egrave: 'È',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
  auml: 'ä',
  Auml: 'Ä',
  ntilde: 'ñ',
  ccedil: 'ç',
  szlig: 'ß',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

function decodeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function extractPartiesFromTitle(title: string): string[] {
  // Many EC headlines: "Commission ... approves <X>'s acquisition of <Y>"
  // <X> may be followed by an apostrophe (curly or straight) + s.
  const m1 = /approves?\s+(.+?)['’]s?\s+acquisition\s+of\s+(.+?)(?:[,.;:]|\s+subject\s+to|\s+from\s+|$)/i.exec(
    title,
  );
  if (m1) return [clean(m1[1]!), clean(m1[2]!)];
  const m2 = /acquisition\s+by\s+(.+?)\s+of\s+(.+?)(?:[,.;:]|\s+subject\s+to|\s+from\s+|$)/i.exec(
    title,
  );
  if (m2) return [clean(m2[1]!), clean(m2[2]!)];
  const m3 = /acquisition\s+of\s+(.+?)(?:[,.;:]|\s+subject\s+to|\s+from\s+|$)/i.exec(title);
  if (m3) return [clean(m3[1]!)];
  return [];
}

function clean(s: string): string {
  return s
    .replace(/\b(commission|european|EU)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*the\s+/i, '')
    .trim();
}

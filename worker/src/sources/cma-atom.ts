import { XMLParser } from 'fast-xml-parser';
import {
  buildContentHash,
  classifyCmaPage,
  partiesFromCmaTitle,
  stripHtml,
  type EventType,
  type NormalisedEvent,
  type Source,
  type SourcePollResult,
} from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';
import { fetchPolitely } from './http.js';

const log = makeLogger('cma-atom');

const ATOM_URL = 'https://www.gov.uk/cma-cases.atom';
const CONTENT_API = 'https://www.gov.uk/api/content';

interface AtomEntry {
  id: string;
  updated: string;
  link: { '@_href': string } | { '@_href': string }[];
  title: string;
  summary?: string;
}

interface ContentApiResponse {
  base_path?: string;
  title?: string;
  description?: string;
  public_updated_at?: string;
  first_published_at?: string;
  details?: {
    body?: string;
    metadata?: {
      case_state?: string;
      case_type?: string;
      market_sector?: string[] | null;
      opened_date?: string;
    };
    change_history?: { public_timestamp: string; note: string }[];
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry' || name === 'link',
});

export interface CmaAtomOptions {
  /** Cap how many entries we fetch per poll. Useful in catch-up mode. */
  maxEntries?: number;
}

export function makeCmaAtomSource(opts: CmaAtomOptions = {}): Source {
  const max = opts.maxEntries ?? 30;
  return {
    id: 'cma-atom',
    label: 'CMA cases (gov.uk Atom)',
    pollIntervalMs: 10 * 60 * 1000,
    poll: () => poll(max),
  };
}

async function poll(maxEntries: number): Promise<SourcePollResult> {
  const res = await fetchPolitely(ATOM_URL, { accept: 'xml' });
  if (!res.ok) {
    throw new Error(`CMA Atom: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  const entries: AtomEntry[] = parsed?.feed?.entry ?? [];

  const events: NormalisedEvent[] = [];
  let processed = 0;
  for (const entry of entries.slice(0, maxEntries)) {
    processed++;
    try {
      const link = Array.isArray(entry.link)
        ? entry.link[0]?.['@_href']
        : entry.link?.['@_href'];
      if (!link) {
        log.warn('skip: no link', { id: entry.id });
        continue;
      }
      const event = await buildEventFromCasePage(link, entry);
      if (event) events.push(event);
    } catch (err) {
      log.warn('entry parse failed', { id: entry.id, err: String(err) });
    }
  }

  return {
    events,
    note: `processed ${processed} feed entries, produced ${events.length} events`,
  };
}

async function buildEventFromCasePage(
  caseUrl: string,
  entry: AtomEntry,
): Promise<NormalisedEvent | null> {
  // gov.uk URLs like https://www.gov.uk/cma-cases/<slug>
  const slug = caseUrl.replace(/^https?:\/\/www\.gov\.uk\//, '');
  const apiUrl = `${CONTENT_API}/${slug}`;
  let content: ContentApiResponse | null = null;
  try {
    const apiRes = await fetchPolitely(apiUrl, { accept: 'json' });
    if (apiRes.ok) {
      content = (await apiRes.json()) as ContentApiResponse;
    }
  } catch (err) {
    log.warn('content api failed; will try HTML fallback', { url: apiUrl, err: String(err) });
  }

  let bodyHtml = content?.details?.body ?? '';
  let title = content?.title ?? entry.title;
  let description = content?.description ?? '';
  let publishedAt = parseDate(
    content?.public_updated_at ?? entry.updated ?? content?.first_published_at,
  );
  let caseType = content?.details?.metadata?.case_type ?? null;
  let caseState = content?.details?.metadata?.case_state ?? null;
  let sectors = content?.details?.metadata?.market_sector ?? [];

  if (!bodyHtml) {
    // HTML fallback. We do not bring in cheerio here unless we need it.
    const htmlRes = await fetchPolitely(caseUrl, { accept: 'html' });
    if (!htmlRes.ok) return null;
    const html = await htmlRes.text();
    // Lazy-load cheerio so the JSON path stays fast.
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);
    title = $('h1').first().text().trim() || title;
    description = $('meta[name="description"]').attr('content') ?? description;
    bodyHtml =
      $('div.govspeak').first().html() ??
      $('article').first().html() ??
      $('main').first().html() ??
      '';
    // best-effort metadata pull
    caseState = caseState ?? extractMetaItem($, 'Case state');
    caseType = caseType ?? extractMetaItem($, 'Case type');
    if (sectors.length === 0) {
      const sectorText = extractMetaItem($, 'Market sector');
      if (sectorText) sectors = sectorText.split(/[,;]/).map((s) => s.trim());
    }
  }

  const eventType: EventType = classifyCmaPage({
    caseType,
    caseState,
    body: bodyHtml,
  });

  const fullText = stripHtml(bodyHtml);
  const summary =
    description ||
    fullText.slice(0, 480) + (fullText.length > 480 ? '…' : '');

  const parties = partiesFromCmaTitle(title);
  const caseRef = slug; // gov.uk slug is a stable per-case identifier

  const contentHash = buildContentHash({
    authority: 'CMA',
    caseRef,
    eventType,
    title,
    publishedAt,
  });

  return {
    authority: 'CMA',
    sourceUrl: caseUrl,
    caseRef,
    eventType,
    title,
    summary,
    fullText,
    parties,
    sectors: sectors ?? [],
    geographies: ['UK'],
    publishedAt,
    attachmentUrls: [],
    contentHash,
  };
}

function parseDate(s?: string | null): Date {
  if (!s) return new Date();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function extractMetaItem(
  $: import('cheerio').CheerioAPI,
  label: string,
): string | null {
  // gov.uk sidebar uses dt/dd patterns and definition lists.
  let val: string | null = null;
  $('dt').each((_, el) => {
    const dt = $(el).text().trim();
    if (dt.toLowerCase().includes(label.toLowerCase())) {
      const dd = $(el).next('dd').text().trim();
      if (dd) val = dd;
    }
  });
  return val;
}

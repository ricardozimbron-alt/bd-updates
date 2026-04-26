/**
 * Tiny shared HTTP helpers for source adapters: a global rate limit per host,
 * a polite User-Agent, and bounded retry on transient failures.
 */

const lastHitByHost = new Map<string, number>();

const HOST_MIN_GAP_MS: Record<string, number> = {
  'www.gov.uk': 120, // ~8 req/s, well below the ~10 req/s GOV.UK limit
  default: 200,
};

export interface FetchOpts {
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  accept?: 'json' | 'xml' | 'html' | 'any';
}

export async function fetchPolitely(url: string, opts: FetchOpts = {}): Promise<Response> {
  const u = new URL(url);
  const minGap = HOST_MIN_GAP_MS[u.host] ?? HOST_MIN_GAP_MS.default!;
  const last = lastHitByHost.get(u.host) ?? 0;
  const wait = Math.max(0, last + minGap - Date.now());
  if (wait > 0) await sleep(wait);
  lastHitByHost.set(u.host, Date.now());

  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const headers: Record<string, string> = {
    'User-Agent': 'BDUpdatesBot/0.1 (+contact: configured-owner)',
    Accept:
      opts.accept === 'json'
        ? 'application/json'
        : opts.accept === 'xml'
          ? 'application/atom+xml, application/xml;q=0.9, */*;q=0.5'
          : opts.accept === 'html'
            ? 'text/html, */*;q=0.5'
            : '*/*',
    ...(opts.headers ?? {}),
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ac.signal });
      clearTimeout(timer);
      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

import type { NormalisedEvent } from './types.js';

export interface SourcePollResult {
  events: NormalisedEvent[];
  /** Free-form note for source health (e.g. "scraped 24 listings, 3 new"). */
  note?: string;
}

export interface Source {
  /** Stable id, used as the key in source_health. */
  id: string;
  /** Human-readable label for /sources page. */
  label: string;
  /** Default poll interval in ms; cron in the worker can override. */
  pollIntervalMs: number;
  poll(): Promise<SourcePollResult>;
}

import { PrismaClient } from './generated/prisma/client.js';
export type { Prisma } from './generated/prisma/client.js';
export {
  PrismaClient,
  Authority,
  EventType,
  RelevanceTier,
  DraftStatus,
  EntityKind,
  ProcessingStatus,
  OwnershipMode,
} from './generated/prisma/client.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

/**
 * Connection-drop codes Neon's serverless pooler can throw at us. Retry these
 * with a small backoff before giving up.
 */
const RETRYABLE_CODES = new Set(['P1001', 'P1011', 'P1017']);
const RETRYABLE_MSG = /Server has closed the connection|Connection terminated|Can't reach database|Engine is not yet connected/i;

function shouldRetry(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code && RETRYABLE_CODES.has(e.code)) return true;
  if (e.message && RETRYABLE_MSG.test(e.message)) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.PRISMA_LOG === '1' ? ['warn', 'error', 'query'] : ['warn', 'error'],
  });
  return base.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            lastErr = err;
            if (!shouldRetry(err)) throw err;
            await sleep(150 * (attempt + 1) ** 2); // 150ms, 600ms, 1350ms
          }
        }
        throw lastErr;
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma: PrismaClient = globalThis.__prisma__ ?? makeClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma__ = prisma;
}

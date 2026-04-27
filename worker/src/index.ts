/**
 * BD updates worker. Long-running Node process. Polls sources on cron and
 * processes pending events through the relevance + drafter pipeline.
 *
 * Communicates with the web app only via the database. No HTTP between them.
 */
import http from 'node:http';
import cron from 'node-cron';
import {
  assertModelReachable,
  makeAnthropicProvider,
  prisma,
  type ModelProvider,
} from '@bdu/lib';
import { makeLogger } from '@bdu/lib/logger';
import { buildAllSources } from './sources/index.js';
import { upsertEvents } from './pipeline/upsert-events.js';
import { processEvent } from './pipeline/process-event.js';
import { notifyHighTierDrafts } from './pipeline/notify.js';
import { recordFailure, recordSuccess } from './pipeline/source-health.js';
import { regenerateDraft } from './pipeline/regenerate-draft.js';

const log = makeLogger('worker');

const sources = buildAllSources();
const sourceById = new Map(sources.map((s) => [s.id, s]));

const inFlight = new Set<string>();

async function pollOne(sourceId: string) {
  if (inFlight.has(sourceId)) {
    log.info('skip: previous poll still running', { sourceId });
    return;
  }
  const src = sourceById.get(sourceId);
  if (!src) {
    log.warn('unknown source', { sourceId });
    return;
  }
  inFlight.add(sourceId);
  try {
    log.info('poll start', { sourceId });
    const t0 = Date.now();
    const result = await src.poll();
    const newIds = await upsertEvents(result.events);
    await recordSuccess(
      sourceId,
      src.label,
      `${result.events.length} events; ${newIds.length} new; ${result.note ?? ''}`,
    );
    log.info('poll done', {
      sourceId,
      ms: Date.now() - t0,
      events: result.events.length,
      new: newIds.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordFailure(sourceId, src.label, msg);
    log.error('poll failed', { sourceId, err: msg });
  } finally {
    inFlight.delete(sourceId);
  }
}

let processingLoop = false;
async function processPending(model: ModelProvider) {
  if (processingLoop) return;
  processingLoop = true;
  try {
    const pending = await prisma.event.findMany({
      where: { processingStatus: 'pending' },
      orderBy: { detectedAt: 'asc' },
      take: 25,
      select: { id: true },
    });
    if (pending.length === 0) return;
    log.info('processing batch', { count: pending.length });
    const allHigh: string[] = [];
    for (const { id } of pending) {
      try {
        const r = await processEvent(id, model);
        allHigh.push(...r.highTierDraftIds);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('process failed', { id, err: msg });
        await prisma.event.update({
          where: { id },
          data: { processingStatus: 'failed', processingError: msg },
        });
      }
    }
    if (allHigh.length > 0) {
      await notifyHighTierDrafts(allHigh);
    }
  } finally {
    processingLoop = false;
  }
}

function readCron(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function startCron(model: ModelProvider) {
  // CMA Atom
  cron.schedule(readCron('CRON_CMA_ATOM_BUSINESS', '*/10 6-19 * * *'), () =>
    pollOne('cma-atom'),
  );
  cron.schedule(readCron('CRON_CMA_ATOM_OFFHOURS', '*/30 0-5,20-23 * * *'), () =>
    pollOne('cma-atom'),
  );

  // EC Press Corner
  cron.schedule(readCron('CRON_EC_PRESS_BUSINESS', '*/10 6-19 * * *'), () =>
    pollOne('ec-press'),
  );
  cron.schedule(readCron('CRON_EC_PRESS_OFFHOURS', '*/30 0-5,20-23 * * *'), () =>
    pollOne('ec-press'),
  );

  // EC case search
  cron.schedule(readCron('CRON_EC_CASES_BUSINESS', '*/15 6-19 * * *'), () =>
    pollOne('ec-case-search'),
  );
  cron.schedule(readCron('CRON_EC_CASES_OFFHOURS', '0 0-5,20-23 * * *'), () =>
    pollOne('ec-case-search'),
  );

  // Process pending events every minute. The function self-debounces.
  cron.schedule('* * * * *', () => processPending(model));
}

function startHealth(model: ModelProvider) {
  const port = Number.parseInt(process.env.WORKER_HEALTH_PORT ?? '8080', 10);
  const adminToken = process.env.WORKER_ADMIN_TOKEN ?? '';

  http
    .createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      try {
        if (url.pathname === '/' || url.pathname === '/healthz') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, t: new Date().toISOString() }));
          return;
        }
        const isAdmin = url.pathname.startsWith('/admin/');
        if (isAdmin && !adminToken) {
          res.statusCode = 503;
          res.end('admin token not configured');
          return;
        }
        if (isAdmin && req.headers['x-admin-token'] !== adminToken) {
          res.statusCode = 401;
          res.end('unauthorized');
          return;
        }
        if (url.pathname === '/admin/poll' && req.method === 'POST') {
          const sourceId = url.searchParams.get('source') ?? '';
          if (!sourceId) {
            res.statusCode = 400;
            res.end('source query param required');
            return;
          }
          // fire-and-forget so the HTTP call returns quickly
          pollOne(sourceId).catch(() => {});
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, queued: sourceId }));
          return;
        }
        if (url.pathname === '/admin/reprocess-event' && req.method === 'POST') {
          const eventId = url.searchParams.get('id') ?? '';
          if (!eventId) {
            res.statusCode = 400;
            res.end('id query param required');
            return;
          }
          await prisma.event.update({
            where: { id: eventId },
            data: {
              processingStatus: 'pending',
              processingError: null,
              processedAt: null,
            },
          });
          processPending(model).catch(() => {});
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, requeued: eventId }));
          return;
        }
        if (url.pathname === '/admin/regenerate-draft' && req.method === 'POST') {
          const draftId = url.searchParams.get('id') ?? '';
          if (!draftId) {
            res.statusCode = 400;
            res.end('id query param required');
            return;
          }
          await regenerateDraft(draftId, model);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, regenerated: draftId }));
          return;
        }
        res.statusCode = 404;
        res.end('not found');
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    })
    .listen(port, () => log.info('health/admin server listening', { port }));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL not set; aborting');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('ANTHROPIC_API_KEY not set — events will be ingested but no judgments will run');
  }

  const model = makeAnthropicProvider();
  log.info('starting worker', {
    model: model.id,
    sources: sources.map((s) => s.id),
  });

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      await assertModelReachable(model);
      log.info('model health-check ok', { model: model.id });
    } catch (err) {
      log.error('model health-check failed; aborting startup', {
        model: model.id,
        err: String(err),
      });
      process.exit(2);
    }
  }

  startHealth(model);
  startCron(model);

  // On startup: kick each source once so we are not idle waiting for the
  // next cron tick. Then run pending processing once.
  for (const s of sources) {
    pollOne(s.id).catch(() => {});
  }
  setTimeout(() => processPending(model).catch(() => {}), 5000);
}

main().catch((err) => {
  log.error('fatal', { err: String(err) });
  process.exit(1);
});

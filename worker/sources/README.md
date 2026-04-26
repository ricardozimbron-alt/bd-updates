# Source adapters

Each adapter implements the `Source` interface from `@bdu/lib`. Adapters are
pure: they fetch from a public publication channel, parse, and return
`NormalisedEvent[]`. They do not write to the database. The worker upserts
their output and runs the dedupe + relevance + drafting pipeline.

## cma-atom

- **Feed:** `https://www.gov.uk/cma-cases.atom`
- **Per-entry detail:** GOV.UK Content API (`/api/content/<slug>`),
  HTML scrape via cheerio as fallback.
- **Classifier:** `classifyCmaPage()` looks at `details.metadata.case_type`
  plus milestone language in `details.body` (e.g. "phase 1 decision",
  "remedies consultation", "final report", "undertakings").
- **Rate limit:** politeness layer in `http.ts` keeps gov.uk under ~8 req/s,
  well below the documented ~10 req/s.
- **Verified live:** parses 30 entries in ~4s; eight distinct
  `EventType` values produced from a single feed pull.

## ec-press

- **Feed:** `https://ec.europa.eu/commission/presscorner/`
- **Filter:** IP/MEX/STATEMENT codes that mention DG COMP topics.
- **Classifier:** `classifyEcPress()` keyword maps headlines to
  `EC_PHASE1_PRESS_RELEASE`, `EC_PHASE2_OPENING`, `ANTITRUST_ENFORCEMENT`,
  `JUDGMENT`, etc.

## ec-case-search

- **Feed:** `https://competition-cases.ec.europa.eu/search/`
- **Detects:** `EC_MERGER_NOTIFIED`, `EC_PHASE1_DECISION_PUBLISHED`,
  `EC_PHASE2_DECISION_PUBLISHED`, `EC_COMMITMENTS_PUBLISHED`.

## Adding a new adapter

1. Create `worker/src/sources/<id>.ts` exporting a `make<Id>Source(): Source`
   factory.
2. Wire it in `worker/src/sources/index.ts`.
3. Choose a stable `id` — used as the row key in `source_health`.
4. Hash with `buildContentHash` from `@bdu/lib/hash` so dedupe works.
5. Verify against live data with
   `pnpm --filter @bdu/worker poll-once <id>` before merging.

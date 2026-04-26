# Handover

## What's deployed

Pending. Local end-to-end is fully verified against the live Anthropic API.
Cloud deployment is blocked on credentials only the owner can paste:

- **Neon** — both pooled (`DATABASE_URL`) and direct (`DIRECT_URL`) URLs.
- **Resend** — API key and a verified sending domain (or `onboarding@resend.dev`
  for first-contact testing).
- **Vercel + Fly** — interactive auth, then deploy from the cloud configs in
  `vercel.json` and `worker/fly.toml`.

Local runtime:

- **Postgres**: Docker container `bdu-pg` on `127.0.0.1:55432`.
- **Web**: `pnpm --filter @bdu/web dev` on `http://localhost:3000`.
- **Worker scripts** (instead of long-running `pnpm --filter @bdu/worker dev`):
  - `pnpm --filter @bdu/worker run seed-events` — poll all sources, upsert.
  - `pnpm --filter @bdu/worker run process-pending` — run pending events
    through Anthropic.
  - `pnpm --filter @bdu/worker run smoke-llm` — DB-free smoke test.
  - `pnpm --filter @bdu/worker run dev-signin` — provision a local owner
    User + Session row, prints the cookie value.

## Operate

```sh
# Local
pnpm dev
pnpm db:studio

# Worker (Fly)
fly logs -a bd-updates-worker
fly status -a bd-updates-worker
fly ssh console -a bd-updates-worker
fly deploy --remote-only

# Web (Vercel)
vercel logs <deployment-url>
vercel --prod
```

## End-to-end verified

The full pipeline has been exercised against live data and the Anthropic API:

- Two seed clients (`mine` Acme + `relationship_partner` Beacon Capital).
- 61 events polled live from CMA Atom + EC Press Corner.
- 56 Pass-2 relevance calls run with `claude-sonnet-4-6`.
- 2 high-tier and 11 medium-tier drafts produced.
- Both ownership modes generated correctly:
  - **Acme** (mine): drafts addressed to GC + Cc Head of Strategy, opening
    with substance, "Best," sign-off, claims grouped by basis with
    verbatim source excerpts.
  - **Beacon Capital** (relationship-partner-led): drafts addressed to
    Jordan Fielding (the partner), opening "Jordan — …" with a clearly
    delimited "DRAFT FOR Beacon Capital LLP" block addressed to Riley
    (the client primary contact). Recipient routing correctly sends to
    `jordan.fielding@cleary-example.com`.
- The in-app assistant (Opus) explains drafts ("the named-competitor
  logic is clean — Acme has both parties tagged"; "the recommerce framing
  may overreach"), takes feedback ("don't flag C2C resale"), and
  applies a global rule via tool use, all in one turn. Tool trace is
  surfaced in the UI for transparency.

## Verified live

- CMA Atom adapter parses 30 entries from `https://www.gov.uk/cma-cases.atom`
  in ~4s. Eight distinct event types produced from a single feed.
- EC Press Corner adapter scrapes 31 cards from the four DG COMP listing
  pages (mergers, antitrust-and-cartels, state-aid, foreign-subsidies-regulation)
  in ~7s.
- Relevance Pass 1 structured screen and tier-from-confidence helper covered
  by unit tests.

The full event → judgment → draft loop has been wired end-to-end in code but
needs a live Anthropic key, a Neon database, and a Resend key to verify the
Pass 2 LLM judgments and email notifications.

## Dashboard, history, bulk actions, keyboard help

- `/` is now a small daily dashboard — counts (events 24h / 7d, pending,
  sources healthy), a 7-bar mini chart of events/day, latest 5 high-tier
  drafts, latest 8 events.
- `/inbox/<id>/history` shows version-by-version diffs of a draft (red
  removed lines, green added lines, subject changes inline).
- The inbox supports multi-select via per-row checkboxes. A floating bulk
  bar offers "Dismiss N" with an inline rule-creation form: dismiss the
  selected drafts, optionally save a new client-scoped or global rule so
  the same pattern is filtered next time.
- `?` opens a keyboard shortcuts overlay. `j`/`k` navigate the inbox.
  `⌘/` (Cmd+/) opens the assistant.
- `☾`/`☼` in the header toggles dark/light mode (persisted to localStorage).
- The CopyButton has a "Preview" peer that shows the To/Cc/Subject/Body
  block in a modal before copying.

## In-app assistant

A floating "Ask" button sits bottom-right on every screen (also bound to
**⌘/** / **Ctrl+/**). The panel is a chat with the assistant powered by
Claude Opus (`ASSISTANT_MODEL`, default `claude-opus-4-7`).

The assistant is page-aware — it sees the current route, the selected draft
id, and the selected client id, and uses tool calls to fetch the relevant
DB rows.

### Read tools (execute immediately)

`list_clients`, `get_client`, `list_pending_drafts`, `get_draft`,
`list_recent_events`, `list_rules`.

### Write tools (PROPOSE only; never execute on their own)

The assistant has NO direct write authority. All write tools are
`propose_*`: they emit a structured proposal back to the user's chat
panel as an Approve/Reject card. The DB only changes when the user
clicks Approve.

- `propose_update_client_profile` → cards shows the new narrative.
- `propose_set_client_ownership` → card shows mode + partner contact.
- `propose_add_relevance_rule` → on Approve, the rule lands as
  **status=candidate** (not active). It still requires the user's second
  click on `/rules` to promote it. Two-stage: (1) approve the proposal,
  (2) actively promote the candidate. This matches the rule pipeline
  "raw feedback → candidate rule → my approval → active rule."
- `propose_dismiss_draft` → card shows reason text.
- `propose_mark_draft_sent` → card carries an irreversibility warning;
  the assistant is instructed to only propose this when the user has
  explicitly said they already sent the email outside the app.

The system prompt is explicit: the assistant must say "I can propose…"
or "I'm queuing a proposal…" and never claim a write happened until the
user Approves and the UI shows ✓.

### Web

Anthropic-managed `web_search` (max 5 calls per turn) — used to look up
parties, sectors, and recent press for context. This is the only place
in the codebase that uses tool use or web search; the relevance and
drafter pipelines stay strictly on the plain Messages API.

## Ownership modes

Each client has `ownershipMode ∈ {mine, relationship_partner}`.

- **mine** — drafts addressed directly to the client primary contacts.
- **relationship_partner** — drafts addressed to a named partner with a
  nested "DRAFT FOR <Client>" block the partner can forward. The drafter
  prompt branches on this; the recipient routing in the DraftPayload also
  branches.

The /clients table has a one-click toggle. Detail edit captures partner
name / email / firm. Inbox detail shows a coloured badge on each draft.

## Event-type taxonomy coverage

The taxonomy defines 24 event types. Coverage by adapter:

### Fully covered (✓)

| Event type | Adapter | Detection |
|---|---|---|
| `CMA_INVITATION_TO_COMMENT` | cma-atom | gov.uk Content API + body milestone match |
| `CMA_PHASE1_DECISION` | cma-atom | "phase 1 decision" / "decision under section 22 or 33" / "SLOC decision" |
| `CMA_PHASE2_REFERENCE` | cma-atom | "refer the merger to a Phase 2" |
| `CMA_PHASE2_INTERIM_REPORT` | cma-atom | "provisional findings" / "interim report" |
| `CMA_REMEDIES_CONSULTATION` | cma-atom | "remedies notice" / "remedies consultation" / "remedies working paper" |
| `CMA_PHASE2_FINAL_DECISION` | cma-atom | "final report" / "final decision" / "final findings" |
| `CMA_UNDERTAKINGS_UPDATE` | cma-atom | "undertakings" |
| `EC_PHASE1_PRESS_RELEASE` | ec-press | DG COMP "Commission approves … acquisition" press headlines |
| `EC_PHASE2_OPENING` | ec-press | "opens in-depth investigation" headlines |
| `EC_PHASE2_PRESS_RELEASE` | ec-press | "prohibits …" / Phase II press headlines |
| `EC_COMMITMENTS_PUBLISHED` | ec-press + ec-case-search | "commitments" tag |
| `EC_MERGER_NOTIFIED` | **ec-case-search** | competition-cases.ec.europa.eu/latest-updates/M (Playwright) |
| `EC_PHASE1_DECISION_PUBLISHED` | ec-case-search | "Decision adopted" / "Cleared" tag |
| `EC_PHASE2_DECISION_PUBLISHED` | ec-case-search | "Phase II decision" / "Prohibited" tag |
| `CONSUMER_ENFORCEMENT_ACTION` | cma-atom | case_type=consumer-protection |
| `CONSUMER_GUIDANCE` | cma-atom | "guidance" in body |
| `CONSUMER_SWEEP` | cma-atom | "sweep" in body |
| `MARKET_INVESTIGATION` | cma-atom | case_type=markets |
| `DMCC_DESIGNATION` | cma-atom | case_type=digital-markets / dmcc |
| `DMCC_CONDUCT_REQUIREMENT` | cma-atom | "conduct requirement" + DMCC case_type |
| `ANTITRUST_ENFORCEMENT` | cma-atom + ec-press | case_type=antitrust/CA98; "fines"/"cartel" in EC headlines |
| `JUDGMENT` | ec-press | "judgment" / "Court of Justice" / "General Court" |
| `CONSULTATION` | cma-atom + ec-press | case_type=consultation; "consultation" in headline |
| `OTHER` | (fallback) | any unmapped item |

### Notes

- **EC press releases** drive every EC merger event type the moment a press
  release is issued. **ec-case-search** is the canonical source for cases
  that don't trigger a press release (most Simplified / Super-simplified
  Phase 1 clearances) and for the actual notification stage.
- **EC_MERGER_NOTIFIED** was a silent gap until ec-case-search was added.
  It is now caught via headless Chromium scrape of the Angular SPA at
  `https://competition-cases.ec.europa.eu/latest-updates/M`. The adapter
  extracts case ref, parties, date, and status tags directly from the
  rendered DOM. No silent gaps remain on the merger event types.

### Trade-offs

- **Headless Chromium** in the worker Dockerfile inflates the image by
  ~150MB (apt: chromium + fonts + libnss3 + libgbm1 + libxkbcommon0). Worker
  memory increased from 512MB to 1GB on Fly. This was the cost of closing
  the EC_MERGER_NOTIFIED gap; the user explicitly required no silent gaps
  on real merger event types before deployment.
- The competition-cases SPA has no public API. POSTs to plausible
  endpoints all return 403 (WAF/auth gate). EUR-Lex (the alternative
  source for OJ C-series prior notifications) is gated behind an AWS WAF
  Captcha that requires JavaScript execution. The Playwright adapter is
  the only reliable path.

## Architectural decisions worth knowing

- **Anthropic API.** Plain Messages API only. Batch, Files, MCP, Code
  Execution, web search are intentionally not used. ZDR is an account-level
  arrangement — confirm in the Anthropic console; the code does NOT set a
  ZDR header, since that would imply something the account may not have.
- **Resend has US data residency.** Account data, logs and metadata sit in
  the US regardless of sending region. So nothing client-related ever goes
  through Resend. Magic-link auth and the generic "new draft pending"
  notification are the only emails sent.
- **Notification email contains no auth token.** The link is plain `/inbox`;
  if the user has no session, Next-Auth bounces them through the standard
  magic-link sign-in.
- **Threshold cap.** `tier=high` requires `confidence >= min(95, threshold + 15)`,
  so a threshold of 90 doesn't demand 105.
- **Database.** `DATABASE_URL` is the pooled (pgbouncer) connection used by
  the runtime. `DIRECT_URL` is the unpooled connection that Prisma migrate
  uses for DDL. Both are needed against Neon.
- **Schema.**
  - `events.contentHash` is indexed but NOT globally unique. Identity is
    `unique(authority, caseRef, eventType, publishedAt)`.
  - `sourceItems` holds the raw source payload per (sourceId, externalId).
    `events` are the normalised commercial/legal events derived from them.
  - `outboxJobs` is the transactional outbox. The plumbing is there; the
    worker still uses an in-process loop with status flags on `events`. The
    next pass will move source-poll, process-event, draft, and notification
    jobs into `outboxJobs` claimed via `SELECT ... FOR UPDATE SKIP LOCKED`.
- **Source claims** are widened to `{claim, basis, evidence, sourceUrl?}`
  with `basis ∈ {source_publication | client_profile | authority_interaction
  | inference}`. The "Why this client?" panel renders by basis category.
- **Prompt-injection guardrail** is in both system prompts. JSON output is
  validated with zod; on schema mismatch the model gets one repair attempt,
  then the job is marked failed.
- **Exemplars** are filter-based (same client + authority + event type, recent
  sent first, then recent dismissed). Embeddings are deferred until the archive
  has volume.
- **Operational buttons.** `/sources` has "poll now" per source. The draft
  detail has "Reprocess event" and "Regenerate draft". These hit the worker's
  admin endpoints (`WORKER_ADMIN_URL` + `WORKER_ADMIN_TOKEN`).

## Known limitations

1. **EC merger case search adapter is a placeholder.** The
   competition-cases.ec.europa.eu site is an Angular SPA without a
   discoverable public API. DG COMP issues a press release for almost every
   Phase 1 clearance, Phase 2 opening and remedies decision, so the
   ec-press adapter already produces those event types. Prior notifications
   of concentrations (`EC_MERGER_NOTIFIED`) appear in the EU Official
   Journal C-series and are not yet captured.
2. **EC press release bodies are not fetched.** The press corner detail page
   is JS-rendered. The adapter takes the title and meta description (both
   server-rendered for SEO); the source URL is shown for the user to read
   the full release. Adding a headless-browser-based fetch is the obvious
   next step here.
3. **CMA case-page hourly poller (DG COMP daily reconciliation).** Not yet
   built. Spec lists this as a step-9 improvement.
4. **Embeddings-based exemplar retrieval is wired but exemplars default to
   an empty array.** Add a job that, on each `Send`, computes an embedding
   and stores it; the drafter then retrieves nearest-neighbour past sends
   for that client. The drafter API already accepts `exemplars`.
5. **Automated rule synthesis (Phase 2 of the spec) is not built.** Manual
   rule entry in `/rules` only.
6. **Matter-chain dedupe (Phase 2) is not built.** Basic content-hash
   dedupe only.

## Next things to build (priority order)

1. **Cloud deployment.** Pasting Neon + Resend keys is the only blocker;
   `vercel.json` and `worker/fly.toml` are ready. Run `vercel link`,
   `fly launch --copy-config --no-deploy`, set secrets, deploy.
2. **EUR-Lex OJ C-series scraper for prior merger notifications.** Daily
   feed at `eur-lex.europa.eu`. This catches `EC_MERGER_NOTIFIED` events.
2. **Headless body fetch for EC press releases.** Use `playwright` in the
   worker or a small fly-side scraper. Surfaces the full press release in
   the inbox source pane.
3. **CMA active-case hourly poller.** For each case in `state=open` from the
   Atom feed, poll the case page hourly during business hours and produce
   a milestone event when `details.body` content hash changes.
4. **DG COMP open-data daily reconciliation.** Once-daily JSON feed. Compare
   to events captured in the last 24 hours; flag any that we missed in a
   `/sources` "missed" column.
5. **Exemplar embeddings.** On each `Send`, compute and store a vector for
   the event; retrieve top-3 nearest at draft time. OpenAI
   `text-embedding-3-small` is fine, or local TF-IDF as a fallback.
6. **Automated rule synthesis from feedback.** Cluster recent dismissals
   (categories + freeText) per client; once a cluster crosses a small
   threshold, propose a rule the user can accept into `/rules` with one
   click.
7. **Matter-chain dedupe.** When two events share `caseRef` but different
   `eventType`, render them as a single thread in the inbox.
8. **Light-mode toggle.** CSS plumbing is present; needs a UI control.

## Operations notes

- The worker exposes a tiny `/` health endpoint on `WORKER_HEALTH_PORT`
  (default 8080). Fly's auto-start can rest it; `min_machines_running = 1`
  in `fly.toml` keeps it warm.
- The worker self-debounces source polls (one in flight per source) and
  the pending-events processor (single-threaded loop). Safe to run on a
  shared-cpu-1x.
- Notification batching: high-tier draft notifications are coalesced if
  another notification went out in the last `NOTIFICATION_BATCH_WINDOW_SECONDS`
  (default 300). The email body shows only a count and a deeplink — no
  client content.
- ZDR header is set on every Anthropic call (`anthropic-beta: zero-data-retention`).
  Confirm this is honoured for your account; some accounts require it to be
  enabled on the dashboard side too.

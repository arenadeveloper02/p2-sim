# Historical Cost Reconciliation SOP

## Purpose and source boundaries

This runbook repairs and verifies historical workflow cost analysis. The authoritative workflow total is:

```sql
SUM(usage_log.cost)
WHERE usage_log.source = 'workflow'
  AND usage_log.execution_id = workflow_execution_logs.execution_id
```

`workflow_execution_logs.cost_total` is an indexed projection of that sum. Never include `copilot`, `workspace-chat`, `mcp_copilot`, `mothership_block`, `knowledge-base`, `enrichment`, `wand`, or `voice-input` in a workflow execution total.

Agent-embedded tools remain folded into the model row as `toolCost` and `embeddedToolCosts`; the log detail and Usage analytics split them virtually. Do not create duplicate standalone tool ledger rows.

## Current baseline

The initial full-history audit found:

- 30,199 reconciled workflow executions.
- 9,253 executions with a positive workflow ledger and `cost_total IS NULL`.
- 60 executions with a non-null projection that differs from the ledger.
- No `billingReconciliationPending` runs or workflow / `mothership_block` double-count candidates.

The 9,253 cases are missing projections, not `cost_total = 0`. The 60 true mismatches are exactly 2× ledger-to-projection mismatches from 2026-07-03 through 2026-07-07, consistent with a multiplier-era projection defect.

## Preconditions

Do not write to production until all checks pass:

- Reconciliation code is committed and CI is green.
- The audit and apply environments use the same `COST_MULTIPLIER` and `USAGE_LOG_COST_MULTIPLIER`.
- Object-store credentials can materialize historical traces.
- Historical models seen in audit output resolve in `apps/sim/providers/models.ts`.
- Historical image models resolve in `apps/sim/lib/tools/image-pricing.ts`.
- Hosted-tool rates (placeholders marked — update when vendor invoices confirm):
  - Firecrawl: `$0.001 × creditsUsed` (`metadata.creditsUsed` or top-level)
  - Serper.dev: `$0.001` per credit (`num > 10` → 2 credits)
  - Exa: prefer API `costDollars.total`; else `$0.007`/request
  - Semrush: `$0.01`/request (PLACEHOLDER)
  - Browser Use: prefer API total cost; else `$0.01` init + `$0.006 × steps` (PLACEHOLDER)
  - Fal.ai: hosted-key markup `× 1.5`; image tools use `IMAGE_MODEL_PRICING`
  - External Cost blocks: multiplier `1`
- LLM-behind-tool blocks (Google Ads, Facebook Ads, Dev, Figma AI) return cost on tool `output.cost` (not a separate side-channel ledger write).
- Copilot and Mothership chat totals remain Go-reported aggregates. Sim cannot reconstruct their historical internal tool costs.
- Audit/dry-run/apply default to `--only-priced-tools` (allowlist in `RECONCILE_PRICED_TOOL_ALLOWLIST`). Use `--all-tools` only for full-inventory audits.

### Mothership chat_id attribution (Usage joins)

Settings → Usage joins mothership/copilot billable cost via `usage_log.chat_id`. Rows missing `chat_id` show as activity without ledger cost (positive Mothership composition with zero per-chat credits).

Reconciliation is **exact-only**. Fuzzy time-window and hashed Arena Copilot matches are reported for review and never applied.

Implementation: `apps/sim/lib/billing/core/mothership-chat-attribution-reconciliation.ts`  
CLI: `scripts/backfill-mothership-chat-attribution.ts`

```bash
# Audit populations (exact / fuzzy-unique / ambiguous / orphan / sha256)
bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts \
  --audit --workspace-id=<workspace_id>

# Dry-run: paginate the full exact scope, write NDJSON shadow artifact
bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts \
  --dry-run --workspace-id=<workspace_id> --artifact=mothership-chat-attribution-shadow.ndjson

# Apply exact event-key + existing-run-id matches only (chat_id IS NULL guards)
bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts \
  --apply --workspace-id=<workspace_id> --artifact=mothership-chat-attribution-apply.ndjson

# Verify scoped SUM(cost)/SUM(raw_cost)/SUM(billable_cost) unchanged
bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts \
  --verify --workspace-id=<workspace_id>

# Guarded rollback from an apply artifact (clears chat_id only; costs unchanged)
bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts \
  --rollback --rollback-from=mothership-chat-attribution-apply.ndjson --workspace-id=<workspace_id>
```

Optional scopes: `--sources=copilot,workspace-chat`, `--start=ISO`, `--end=ISO`, `--batch-size=N`.

For the diagnosed workspace (`1f43034d-182e-4fc6-93aa-118f55652bc3`), expect the safe pass to attach **160 of 222** rows and leave **62** unchanged for review. Total ledger dollars/credits must remain byte-for-byte unchanged across apply and rollback.

`--fuzzy` apply is removed. Fuzzy-unique rows appear in audit/dry-run reports only.

Run the preflight checks:

```bash
cd apps/sim

bun test \
  lib/billing/core/historical-workflow-reconciliation.test.ts \
  lib/billing/core/tool-llm-cost.test.ts \
  lib/billing/core/usage-log.test.ts \
  lib/logs/execution/logger.test.ts \
  lib/logs/execution/logging-factory.test.ts \
  providers/utils.test.ts \
  lib/tools/image-pricing.test.ts \
  tools/exa-hosting.test.ts \
  tools/firecrawl-crawl-hosting.test.ts \
  tools/semrush-hosting.test.ts \
  tools/browser-use-hosting.test.ts \
  app/api/logs/execution/\[executionId\]/verify-costs/route.test.ts

bun run type-check
bun run lint:check

cd ../..
bun run vendor-pricing:check
bun run check:api-validation:strict
```

## Step 1: establish the baseline

```bash
bun --env-file=apps/sim/.env run scripts/phase0-arena-cost-audit.ts \
  --days=9999 --limit=100000 --export-drift
```

Expected change: none.

Review separately:

- workflow ledger/projection health;
- Copilot/Mothership aggregate totals;
- Mothership double-count candidates;
- missing `pricing_snapshot` and provider attribution;
- `billingReconciliationPending` executions.

## Step 2: repair workflow projections

Repair only the indexed `cost_total` projection for:

- rows where `cost_total IS NULL` and the workflow ledger is positive;
- rows where non-null `cost_total` differs from the workflow ledger by more than `1e-6`.

For every repaired execution:

```text
workflow_execution_logs.cost_total
  = SUM(usage_log.cost WHERE source = 'workflow' AND execution_id = execution)
```

This projection repair must not insert, delete, or reprice `usage_log` rows. It must not affect non-workflow sources or embedded-tool attribution.

Preview first (no writes):

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --repair-projections --batch-size=1000
```

Then persist:

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --repair-projections --write --batch-size=1000
```

Optional scope: `--workspace-id=`, `--execution-id=`, `--since=`, `--limit=`.

Re-run the Step 1 audit (or `--verify`). The ~9,313 projection discrepancies should disappear without any change in the workflow ledger total. After that, `--audit --only-priced-tools` shows which priced-tool executions still need ledger reprice — not projection noise.

## Step 3: classify historical pricing evidence

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --audit --since=2020-01-01 --batch-size=1000 \
  --export=reconciliation-audit.json
```

Defaults to `--only-priced-tools`: executions without allowlisted hosted tools, Cost blocks, or LLM-on-tool blocks are `out_of_scope` (not apply-eligible). Pass `--all-tools` to classify every terminal workflow run.

`--batch-size` is the keyset page size (default `1000`). Without `--limit`, the audit walks the full filtered window page by page. Use `--limit=<n>` to cap total attempted executions, and `--concurrency=<n>` (default `8`) to bound parallel evidence loads within each page. Each audit or dry-run execution has a 120-second wall-clock deadline so a hung database or object-store read cannot block its page indefinitely. Override it only when investigating a known slow execution with `--execution-timeout-ms=<n>`.

The CLI prints live `[progress]` lines about every 100 attempted executions, every 30 seconds while a page is in flight, and once when finished. Heartbeats include the IDs and elapsed times of active executions, making a slow or stalled record identifiable. Mirror them with `tee` if you want a log file:

```bash
set -o pipefail
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --audit --since=2020-01-01 --batch-size=1000 \
  --export=reconciliation-audit.json 2>&1 | tee reconciliation-audit.log
```

Long audits reuse the shared DB pool. Each page starts with a `select 1` keepalive, and list/evidence queries retry up to 5 times on transient disconnects (`CONNECTION_CLOSED`, reset, timeout). Missing object-store traces still classify as `missing_trace_data` and are not treated as hard failures. A per-execution deadline is reported as `HistoricalReconcileExecutionTimeoutError`; the batch continues, exits nonzero, and includes that execution in `failures`.

Expected change: local audit artifact only.

The export includes `summary.attempted` / `skipped` / `failed`, plus a `failures[]` array with nested Postgres/driver causes. If `failed > 0`, treat the artifact as incomplete until those executions are retried or explicitly dispositioned. The command exits nonzero when any classification fails.

Proceed only with high- or medium-confidence workflow evidence:

- fixed execution fee;
- hosted-model tokens or retained inline cost;
- standalone hosted-tool output metadata;
- agent-embedded tool metadata or retained tool output cost;
- Cost block configuration from the execution snapshot;
- Go cost returned from a workflow Mothership block.

Do not auto-apply BYOK ambiguity, missing traces, expression Cost blocks, Mothership double-count risk, unsupported image/tool pricing, or negative target deltas.

## Step 3b: manual verify in workflow logs (read-only)

For a single execution, use Log details → **Verify pricing**, or:

```http
POST /api/logs/execution/<executionId>/verify-costs
```

This runs the same shadow reprice as CLI dry-run with `onlyPricedTools: true`. It never writes. Compare billed ledger lines vs expected targets + deltas before any apply.

## Step 4: generate and review a shadow artifact

Start with a single known-good execution:

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --dry-run --execution-id=<execution-id> \
  --export=reconcile-pilot.ndjson --review-deltas
```

Then use a small workspace scope:

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --dry-run --workspace-id=<workspace-id> --batch-size=100 --limit=100 \
  --export=reconcile-workspace.ndjson --review-deltas
```

`--batch-size` pages the dry-run the same way as audit; `--limit` caps total attempted executions. Dry-run also prints `[progress]` lines and exits nonzero when any execution fails to reprice.

Expected change: NDJSON artifact only. Each successful record is appended immediately when that execution finishes; records are not held until the rest of the page completes. An interrupted run therefore preserves every completed record, including records from a partially completed page.

While the dry-run is active, verify that the artifact is advancing:

```bash
wc -l reconcile-shadow.ndjson
```

If the process is interrupted or exits with failures, retain the artifact and resume it:

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --dry-run --since=2026-05-01 --batch-size=1000 --only-priced-tools \
  --export=reconcile-shadow.ndjson --review-deltas --resume
```

`--resume` validates the existing NDJSON, skips execution IDs already present, and retries missing or timed-out executions. If one execution repeatedly times out, use the ID printed in the failure/heartbeat output for a targeted investigation; do not apply an incomplete artifact. A newly created zero-line artifact contains no recoverable records and should simply be rerun with the fixed script.

For each reviewed execution, verify:

- base + model-only + tools + external equals `targetSum`;
- named embedded tools plus the unattributed remainder equal `toolCost`;
- an embedded tool does not also appear as a standalone tool charge;
- target cost is backed by retained evidence or the current supported catalog;
- Copilot/Mothership aggregate rows are unchanged;
- negative deltas are reported for manual treatment, never silently ignored.

Generate a fresh artifact immediately before applying it. Require a `(done)` progress line, `Failed: 0`, a zero exit status, and an artifact line count matching the final `total records` count before proceeding.

## Step 5: pilot apply

Run only after Steps 1–4 pass:

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --apply --input=reconcile-workspace.ndjson \
  --workspace-id=<workspace-id> --batch-size=100
```

Expected change:

- deterministic reconciliation rows for evidence-backed workflow deltas;
- `workflow_execution_logs.cost_total` refreshed to the exact workflow ledger sum;
- no writes to Copilot-family rows;
- repeat of the same artifact is idempotent.

Do not use production apply until the implementation supports the approved correction policy for negative deltas, BYOK evidence, artifact staleness, and historical billing attribution.

## Step 6: verify the pilot

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --verify --workspace-id=<workspace-id> --batch-size=1000

bun --env-file=apps/sim/.env run scripts/phase0-arena-cost-audit.ts \
  --days=9999 --limit=100000 --drift-only
```

Require:

- no workflow projection drift in pilot scope;
- additive log-detail leaves equal the workflow total;
- Usage analytics virtual split preserves total cost;
- no duplicate reconciliation event keys;
- no movement in Copilot/Mothership source totals.

## Step 7: production rollout

Process bounded date windows. For each window: audit, dry-run, review, apply, then verify.

```bash
bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts \
  --apply --input=reconcile-window.ndjson \
  --batch-size=500 --confirm-production
```

Stop immediately on a lock error, unexpected source movement, pricing anomaly, non-zero projection drift, or a large unexplained negative-delta population.

## Completion criteria

- Every workflow `cost_total` is the exact workflow-source ledger projection.
- Every automatically corrected workflow cost has high- or medium-confidence evidence and reproducible provenance.
- Embedded tools remain a virtual split of model cost.
- Copilot and Mothership chat totals are preserved as Go-reported aggregates.
- All ambiguous, unsupported, double-count-risk, and negative-delta cases have an explicit manual disposition.

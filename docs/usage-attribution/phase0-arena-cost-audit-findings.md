# Phase 0: Arena Cost-Path Audit — Findings

**Date:** 2026-07-06  
**Scope:** Answer whether Arena's LLM contracts populate `output.cost` through `apps/sim/providers/*`, how that cost reaches `usage_log`, and whether `workflow_execution_logs.cost_total` reconciles with the ledger.

## Executive summary

| Path | `output.cost` populated? | Reaches `usage_log`? | Notes |
|------|--------------------------|----------------------|-------|
| Workflow Agent (hosted model) | **Yes** — `executeProviderRequest` → `calculateCost` | **Yes** — trace spans → `calculateCostSummary` → `recordExecutionUsage` | Requires model in hosted list + pricing in `models.ts` |
| Workflow Agent (BYOK) | **Yes, but $0** — `zeroCostForBYOK` | **No model rows** — `recordUsage` skips `cost > 0` | Correct by design |
| Copilot / workspace-chat | **N/A** — cost from Go mothership stream `complete.payload.cost` | **Yes** — `postStreamBillingUpdateCost` → `/api/billing/update-cost` | Sim does not price via `providers/*` |
| Mothership block (workflow) | **Forwarded** — `result.cost` from Go `/api/mothership/execute` final event | **Yes** — same workflow ledger path as Agent when `cost.total > 0` on block output | Depends on Go returning cost |
| Hosted tool (e.g. Firecrawl parse) | **Yes** — `applyHostedKeyCostToResult` when `tool.hosting.pricing` exists | **Yes** — `costSummary.charges` → `category: tool` | `firecrawl_scrape` has **no** `hosting` block today |
| Cost block | **Yes** — `CostBlockHandler` emits `output.cost` | **Yes** — `category=external` verified empirically (migration `0249`) | Pass-through vendor spend; multiplier exemption deferred to Phase 2 |
| Non-hosted / unpriced model ID | **Yes, but $0** | **No** — filtered at `recordUsage` (`cost > 0`) | Silent under-billing risk |

**Gate for Phase 2 pricing work:** Workflow Agent hosted models **do** populate `output.cost` through `providers/*` when the model is in `getHostedModels()` and has pricing in `providers/models.ts`. Copilot/mothership chat billing is **outside** `providers/*` — Go computes cost and Sim records it via the billing callback. Several Arena-relevant model IDs (date-suffixed Anthropic IDs, `gpt-4o-mini`, copilot default `claude-3-7-sonnet-latest`) have **pricing gaps** that produce $0 cost even on hosted paths.

## Methods

### 1. Empirical DB reconciliation

Script: `scripts/phase0-arena-cost-audit.ts`

```bash
bun --env-file=apps/sim/.env run scripts/phase0-arena-cost-audit.ts --days=365 --limit=500
```

**Result:** Connected dev DB (`p2-agents-dev-v2`) returned **0** `workflow_execution_logs` and **0** `usage_log` rows. No live reconciliation was possible on this environment. Re-run against staging/prod or a local DB seeded with instrumented runs before Phase 2 ships.

### 2. Static pricing coverage

Script: `scripts/phase0-arena-pricing-coverage.ts`

```bash
bun run scripts/phase0-arena-pricing-coverage.ts
```

### 3. Unit tests (cost pipeline)

```bash
cd apps/sim && bunx vitest run lib/logs/execution/logging-factory.test.ts lib/logs/execution/logger.test.ts
```

**Result:** 66/66 passed — confirms `calculateCostSummary` aggregation and `cost_total == SUM(usage_log)` reconciliation logic under mocked conditions.

### 4. Cost block → `external` ledger (instrumented)

Script: `scripts/phase0-cost-block-external-verify.ts`

```bash
# Requires migration 0249 (usage_log_category 'external') on the target DB.
# recordUsage also expects 0250 attribution columns on usage_log.
bun --env-file=apps/sim/.env run scripts/phase0-cost-block-external-verify.ts
```

Unit tests (same pipeline, mocked DB):

```bash
cd apps/sim && bunx vitest run \
  executor/handlers/cost/cost-handler.test.ts \
  lib/logs/execution/logging-factory.test.ts \
  lib/logs/execution/logger.test.ts \
  -t "external|Cost block"
```

**Result (2026-07-06, dev DB):** **PASSED**

1. `CostBlockHandler` — fixed $0.42 USD, vendor `Phase0 Partner API`
2. `calculateCostSummary` — `external["Phase0 Cost"].total === 0.42`
3. `recordUsage` — inserted `category=external`, `source=workflow`, `vendor`, `metadata` (`originalAmount`, `originalCurrency`, `source`)
4. DB readback confirmed; test row cleaned up

**Multiplier note:** With `USAGE_LOG_COST_MULTIPLIER=1`, external cost passed through unchanged (`$0.42 → $0.42`). Today `scaleUsageEntry` does **not** exempt `category=external` — Phase 2 should set `rawCost = billableCost = recorded amount` without markup.

**Attribution columns (0250):** `actor_user_id`, `occurred_at`, lineage fields exist on schema but are **not yet written** by `recordUsage` — Phase 2 write-path work. External rows land with those columns `NULL` today, same as other categories.

**`quantity` / `unit`:** Populated when `CostBlockHandler` `raw` includes them (e.g. response-path / labeled runs). Fixed-mode instrumented run had `vendor` + metadata only; unit tests cover quantity/unit via trace span fixtures.

## Cost flow diagrams

### Workflow execution (Agent block)

```
Agent block handler
  → executeProviderRequest (providers/index.ts)
      → provider.executeRequest (openai/anthropic/gemini/…)
      → if response.tokens && shouldBillModelUsage(model) && !isBYOK:
            response.cost = calculateCost(model, tokens…)  // providers/utils.ts
      → else: response.cost = { total: 0, … }
  → block output.cost on trace span (span-factory.ts enrichWithProviderMetadata)
  → calculateCostSummary(traceSpans) (logging-factory.ts)
  → recordExecutionUsage → recordUsage (usage-log.ts, cost > 0 only)
  → cost_total refined to ledger sum in same advisory-locked tx (logger.ts)
```

### Copilot / mothership chat

```
Go mothership stream → complete event (MothershipStreamV1CompletePayload.cost)
  → handleCompleteEvent (lib/copilot/request/handlers/complete.ts)
  → postStreamBillingUpdateCost (if cumulativeCost > 0)
  → POST /api/billing/update-cost (source: copilot | workspace-chat | mothership_block)
  → recordUsage / recordCumulativeUsage
```

Models for copilot are listed by Go (`/api/get-available-models`), not `providers/models.ts`. Billing model label defaults to `'mothership'` when request has no model field.

## Representative model pricing matrix

| Model ID | Hosted | `shouldBillModelUsage` | Pricing in `models.ts` | Sample $/1M tokens (in+out) |
|----------|--------|------------------------|------------------------|-----------------------------|
| `gpt-4o` | yes | yes | yes | $12.50 |
| `gpt-4o-mini` | **no** | **no** | **no** | $0 |
| `o1` | yes | yes | yes | $75.00 |
| `o3-mini` | yes | yes | yes | $5.50 |
| `claude-sonnet-4-6` | yes | yes | yes | $18.00 |
| `claude-sonnet-4-5` | yes | yes | yes | $18.00 |
| `claude-sonnet-4-5-20250514` | **no** | **no** | **no** (exact match only) | $0 |
| `claude-3-7-sonnet-latest` | **no** | **no** | **no** | $0 |
| `gemini-2.5-pro` / `flash` | yes | yes | yes | $11.25 / $2.80 |
| `grok-4-latest` | yes | yes | yes | $3.75 |
| `deepseek-v3` | no | no | no | $0 |
| `mothership` | no | no | no | $0 (Go-priced) |
| `azure-anthropic/claude-sonnet-4-5` | no | no | yes* | $18.00 |
| `vertex/gemini-2.5-pro` | no | no | yes* | $11.25 |
| `bedrock/…claude-sonnet-4-5…` | no | no | yes* | $18.00 |

\*Pricing exists in catalog but models are **not** in `getHostedModels()`, so users must BYOK — `executeProviderRequest` sets `output.cost.total = 0`.

### Pricing lookup limitation

`getModelPricing` in `providers/models.ts` uses **exact** `model.id` match (case-insensitive). It does **not** strip date suffixes (e.g. `-20250514`). Provider APIs often return suffixed IDs → $0 cost + warn log from `calculateCost`.

`supportsNativeStructuredOutputs` already handles date-suffixed matching; pricing does not.

## Path-by-path findings

### A. Hosted LLM (Agent block) — **works when model is hosted + priced**

- **Entry:** `apps/sim/providers/index.ts` `executeProviderRequest`
- **Gate:** `shouldBillModelUsage(response.model) && !isBYOK`
- **Hosted list:** `getHostedModels()` = OpenAI + Anthropic + SambaNova + Google + xAI model IDs from `PROVIDER_DEFINITIONS`
- **Multiplier:** `getCostMultiplier()` applied to input/output in `calculateCost`
- **Streaming:** Individual providers set `output.cost` in stream callbacks (openai, anthropic, gemini, etc.); BYOK zeroing applies via `zeroCostForBYOK`

**Risk:** Any workflow using `gpt-4o-mini`, date-suffixed Claude IDs, or copilot-era aliases will show **zero** model cost in traces and **no** `usage_log` model row.

### B. BYOK — **correct $0 on block output; segment costs zeroed**

- `getApiKeyWithBYOK` → `isBYOK = true`
- Block-level `response.cost` set to zero; `zeroModelSegmentCosts` prevents child span double-count
- No `usage_log` model rows (filtered by `cost > 0`)
- Phase 2 plan: write zero-cost rows with `billable = false` for attribution visibility

### C. Copilot / mothership chat — **outside `providers/*`**

- Cost originates in **Go mothership** (`complete.payload.cost` per `mothership-stream-v1.ts`)
- Sim records only when `cumulativeCost > 0` (`post-stream-update-cost.ts` early return)
- Model label on ledger: `context.billingModel` or `'mothership'`
- **Cannot** validate Go pricing against `vendor-pricing.json` from this repo alone

**Recommendation:** Instrument one copilot chat on staging; compare Go-reported `cost.total` to token counts × `vendor-pricing.json` rates for the billed model.

### D. Mothership block in workflows — **depends on Go execute response**

- `mothership-handler.ts` `formatMothershipBlockOutput` passes `cost: result.cost`
- If Go returns cost, it flows through same Agent-like trace → ledger path
- If Go omits cost, block output has no cost → no ledger row

### E. Hosted tool (Firecrawl) — **partial**

| Tool | `hosting.pricing` | `vendor-pricing.json` | Workflow billing |
|------|-------------------|----------------------|------------------|
| `firecrawl_parse` | yes (credits × $0.001) | $0.001/request | yes via `costSummary.charges` |
| `firecrawl_scrape` | **no** | $0.001 listed but **unwired** | **no** hosted cost on output |

Other hosted tools (Exa, fal.ai, PDL, etc.) follow the `applyHostedKeyCostToResult` path when `hosting.pricing` is defined.

### F. Cost block → `external` — **verified end-to-end**

- `CostBlockHandler` produces `output.cost` and `type: 'cost'` trace spans
- `calculateCostSummary` buckets into `external` map (not `charges` — avoids double-classification as tool)
- `recordExecutionUsage` writes `category: 'external'` with `vendor` / `quantity` / `unit` / `ExternalUsageMetadata`
- DB enum: migration **`0249_usage_log_category_external.sql`** (`ALTER TYPE usage_log_category ADD VALUE 'external'`)
- **Empirical verification:** `scripts/phase0-cost-block-external-verify.ts` — PASSED on dev DB after applying 0249 (+ 0250 `usage_log` columns required by current `recordUsage` insert)

**Phase 2 (not Phase 0):** exempt `external` from `scaleUsageEntry` multiplier; thread `actor`/`lineage`/`occurred_at` onto external rows; dashboard by-vendor external breakdown (Phase 3).

## `cost_total` vs `usage_log` reconciliation

From `logger.ts` + tests:

1. At terminal completion, `recordExecutionUsage` builds target lines from `costSummary` (models, charges, external, execution_fee).
2. Delta entries inserted under `pg_advisory_xact_lock(executionId)`.
3. `cost_total` set to **exact** `SUM(usage_log WHERE source='workflow')` inside same transaction.
4. **Invariant (when path succeeds):** `cost_total == SUM(usage_log)` for workflow source.

**Known failure modes (logged, swallowed):**

- Missing billing user → skip recording
- Deleted workflow → skip
- Advisory lock timeout → partial ledger
- `recordUsage` failure at terminal boundary → under-billed run (`cost_total` may exceed ledger)

**Current filter:** `recordUsage` drops entries with `cost <= 0` — zero-token/zero-cost runs produce **no** ledger rows except via `execution_fee` if base charge applies.

## Arena vs Sim defaults diff

| Area | Arena / fork behavior | Sim upstream default | Impact on cost |
|------|----------------------|---------------------|----------------|
| Agent default model | `gpt-4o` (block default) | same | priced |
| Copilot DB default | `claude-3-7-sonnet-latest` (schema) | varies | **unpriced** in `models.ts` |
| Copilot model list | Go `get-available-models` | static catalog | Go may expose IDs Sim doesn't price |
| Hosted providers | openai, anthropic, google, xai, sambanova | same set in `getHostedModels` | aligned |
| Anthropic catalog | `claude-sonnet-4-6` default; `4-0` commented out | upstream may differ | tests reference removed `claude-sonnet-4-0` |
| Arena deployment | `agent.thearena.ai` hosts | `sim.ai` | billing callbacks use same Sim code paths |

## Phase 2 work items (gated by this audit)

1. **Canonical model ID normalization at write time** — strip date suffixes before `calculateCost` / ledger `description` (fixes `claude-sonnet-4-5-20250514` fragmentation).
2. **Add pricing for high-traffic gaps:** `gpt-4o-mini`, `claude-3-7-sonnet-latest` (or change copilot default to a priced ID).
3. **Wire `firecrawl_scrape` hosting** to match `vendor-pricing.json` (or document as BYOK-only).
4. **Go mothership pricing audit** — separate pass on staging comparing stream `complete.payload.cost` to expected rates for Arena contract models.
5. **Zero-cost ledger rows** (Phase 2 plan) — write `billable = false` rows so attribution works even when cost is $0.
6. **`pricingSnapshot` mandatory** on model rows — many paths don't capture it today.
7. **External multiplier pass-through** — exempt `category=external` in `scaleUsageEntry` (vendor spend is pass-through, not margin).
8. **Re-run `scripts/phase0-arena-cost-audit.ts`** on an environment with execution data before shipping Phase 3 dashboard.

## Manual instrumented workflow checklist

When a populated DB and API keys are available, run these five workflows and inspect per `execution_id`:

```sql
SELECT execution_id, cost_total FROM workflow_execution_logs WHERE execution_id = $1;
SELECT category, description, cost, source, metadata FROM usage_log WHERE execution_id = $1 ORDER BY created_at;
```

| # | Workflow | Expected `output.cost` source | Expected ledger |
|---|----------|------------------------------|-----------------|
| 1 | Agent + `claude-sonnet-4-6` hosted | `providers/index.ts` | `category=model`, description=`claude-sonnet-4-6` |
| 2 | Agent + `gemini-2.5-flash` hosted | providers | model row |
| 3 | Agent + Firecrawl parse (hosted) | tool `hosting.pricing` | `category=tool` |
| 4 | Agent + BYOK OpenAI key | $0 block cost | no model row (until Phase 2 zero rows) |
| 5 | API → Cost block (fixed $0.42) | CostBlockHandler | `category=external` | **Done** — `phase0-cost-block-external-verify.ts` |

Compare `cost_total` to `SUM(cost)` — should match within 1e-8.

## Artifacts

- `scripts/phase0-arena-cost-audit.ts` — DB reconciliation + source breakdown (includes `external` category)
- `scripts/phase0-arena-pricing-coverage.ts` — static model pricing matrix
- `scripts/phase0-cost-block-external-verify.ts` — instrumented Cost block → `usage_log` external row verification
- This document

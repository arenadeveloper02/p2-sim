# Upstream Sync Run — 2026-07-31

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `7d1c927a`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 1
- **Merge tip cap:** max-commits=1 (full upstream HEAD `19d929b1`)

## Grill analysis

### Scope
Single upstream commit in range: `7d1c927a` — **simstudioai/sim#5559** `fix(models): correct model catalog data and Gemini thinking-config wire format`. Bounded analysis to this one commit only.

### Upstream FBI (this batch)
- **Bug/data-correction (#5559)** — a model-catalog data audit plus one real wire-format bug:
  - **OpenAI:** `gpt-5.6-terra` / `gpt-5.6-luna` lose the `max` reasoning-effort value; `gpt-5.6-sol` keeps `max` (verified Sol-exclusive).
  - **Anthropic:** `claude-sonnet-4-6` `maxOutputTokens` 64k→128k; `claude-opus-4-0` / `claude-sonnet-4-0` / `claude-3-haiku-20240307` kept in catalog but marked `deprecated:true` (backward-compat: preserves `getHostedModels()`/`shouldBillModelUsage()` resolution for saved workflows); `anthropic/core.ts` clamp fix so `budget_tokens` can't be ≥ `max_tokens` for `claude-opus-4-1` at default thinking.
  - **Google/Vertex:** un-deprecate `gemini-3-flash-preview`; add `thinking` capability to `gemini-2.5-pro/flash/flash-lite`; **real bug** in `gemini/core.ts` — send `thinkingBudget` (not `thinkingLevel`) for Gemini 2.5-series (2.5 rejects `thinkingLevel`); explicit `thinkingBudget:0` when disabling thinking on 2.5-flash/flash-lite.
  - **Bedrock:** `bedrock/anthropic.claude-opus-4-1` marked `deprecated:true` per AWS lifecycle.

### Files touched vs fork-owned paths
None of the 6 touched files are in `merge-policy.json` `forkFirst`, `upstreamFirst`, or `manualReview`. All are upstream-owned provider infra (`apps/sim/providers/**`). Policy: **upstream wins on shared infra unless the ledger says otherwise** — ledger has no exception for provider/model files.

### Conflict surface (trial 3-way merge)
- Clean apply: `anthropic/core.ts`, `gemini/core.ts`, `google/utils.ts`, `google/utils.test.ts`.
- **Conflicts (positional, not semantic):**
  - `apps/sim/providers/models.ts` — fork heavily reordered/extended the catalog (1662+/1504− vs merge-base), so upstream's targeted hunks land in shifted context. The fork still contains **every** model entry upstream edits (`gpt-5.6-sol/terra/luna`, `claude-sonnet-4-6`, `gemini-2.5-*`, `gemini-3-flash-preview`, the three retired Claude IDs, `bedrock/…claude-opus-4-1`), so all corrections are applicable.
  - `apps/sim/providers/utils.test.ts` — fork added test blocks (`resolveBlockModelCost`, `normalizeProviderCost`, `transformBlockTool image generator`, hosted-model-ID tests). Upstream edits only the shared `Model Capabilities` describe block (stale `claude-*-4-0` → `claude-*-4-5`/`4-1`). Positional conflict; fork-added blocks preserved.

### Take vs skip — resolution (mechanical, no human decision required)
- **TAKE** all of #5559. These are upstream data corrections + a genuine Gemini wire-format bugfix on upstream-owned files. Verified the fork did **not** intentionally diverge on the one fork-sensitive item: at merge-base `e2fecc86` all three `gpt-5.6` models carried `max`; #5559 is itself the change that removes it from terra/luna, so there is no fork intent to preserve.
- **Preserve** fork-added model entries and fork-added test `describe` blocks during conflict resolution — child conflict agent applies upstream's specific hunks on top of fork structure.
- Retired Claude IDs remain `deprecated:true` (still hosted/billable), so no fork billing/hosted-key regression. Fork copilot generated artifacts are refreshed post-merge via `bun run mship:generate` (`regenerateAfterMerge`).

### Open decisions requiring humans
**None.** Every change resolves from `merge-policy.json` (upstream-wins-on-shared-infra) + confirmed non-divergence at the merge-base. No PR question posted.


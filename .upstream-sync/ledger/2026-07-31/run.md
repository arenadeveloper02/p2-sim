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

Single upstream commit in range: `7d1c927a` — **simstudioai/sim#5559** `fix(models): correct model catalog data and Gemini thinking-config wire format`. Squashed from 5 sub-commits (initial fixes → Greptile backward-compat restore → per-model audit restore → comment tidy). Pure provider-layer data/wire correctness fix. No schema, no migration, no API-contract, no dependency changes.

Files touched (6, all `apps/sim/providers/`):

| File | Upstream Δ | Fork diverged since base? | Overlap type |
|------|-----------|---------------------------|--------------|
| `models.ts` | 32 lines | **yes** (1662+/1504−) | textual only — no competing edits on target entries |
| `anthropic/core.ts` | 26 lines | yes (8+) | non-overlapping hunks |
| `utils.test.ts` | 50 lines | yes (147+/6−) | textual only — assertions must track data |
| `gemini/core.ts` | 20 lines | no | clean take |
| `google/utils.ts` | 41 lines | no | clean take |
| `google/utils.test.ts` | 60 lines | no | clean take |

### Upstream FBIs in this batch (#5559)

- **Bug — Anthropic budget clamp** (`anthropic/core.ts`): `budget_tokens` could be sent `>= max_tokens` (e.g. claude-opus-4-1 at default thinking). Fix shrinks the budget itself, floored at documented `ANTHROPIC_MIN_BUDGET_TOKENS=1024`, with `ANTHROPIC_THINKING_OUTPUT_HEADROOM=4096`.
- **Bug — Gemini thinking wire format** (`gemini/core.ts`, `google/utils.ts`): 2.5-series models reject `thinkingLevel`; must send `thinkingBudget`. Also, selecting `none` on 2.5-flash / 2.5-flash-lite sent no `thinkingConfig` (dynamic default left thinking ON) — now sends explicit budget `0`; 2.5-pro correctly excluded (floor 128).
- **Data — model catalog corrections** (`models.ts`): sonnet-4-6 `maxOutputTokens` 64k→128k; gpt-5.6 **Terra & Luna** lose fabricated `max` reasoning value (**Sol keeps `max`** — real Sol-exclusive value); gemini-3-flash-preview un-deprecated; gemini-2.5-pro/flash/flash-lite gain `thinking` capability (google + vertex); bedrock claude-opus-4-1 marked `deprecated` (AWS lifecycle). Retired claude-opus-4-0 / claude-sonnet-4-0 / claude-3-haiku-20240307 kept as `deprecated:true` (not deleted) to preserve `getHostedModels()`/`shouldBillModelUsage()` resolution for saved workflows.

### Fork-owned paths at risk

**None.** All 6 files are shared provider infra — none appear in `merge-policy.json` `forkFirst`, `upstreamFirst`, or `manualReview`. Per policy, upstream wins on shared infra unless the ledger says otherwise; ledger says nothing contrary.

### Fork divergence assessment (no competing edits)

The fork sits at the **exact pre-fix baseline** for every entry #5559 touches — it has made no independent edits to those specific values:

- gpt-5.6 sol/terra/luna: fork still has `max` on all three.
- claude-sonnet-4-6: fork has `64000`; gemini-3-flash-preview: fork has `deprecated:true`; gemini-2.5-pro/flash/flash-lite: fork has no `thinking` block.
- `utils.test.ts`: fork still asserts `claude-sonnet-4-6 → 64000` and references the retired IDs (21×).

The fork's large `models.ts` / `utils.test.ts` deltas are **additive/reordering** (custom Arena/P2 models + added tests) in regions disjoint from #5559's target entries. `anthropic/core.ts`'s fork delta (automatic prompt-cache: import + `cache_control` payload field near lines 3/315) is in different hunks than upstream's budget clamp (const block ~L82, clamp ~L344) — both coexist.

### Take vs skip

**Take the entire commit.** Every change is upstream data/wire correctness on shared infra with no fork-owned conflict. Nothing to skip; `skipped.md` correctly empty.

### Resolution guidance for merge/child agents (mechanical)

1. `gemini/core.ts`, `google/utils.ts`, `google/utils.test.ts` — clean take-upstream (fork untouched).
2. `anthropic/core.ts` — union merge: keep fork's prompt-cache additions **and** upstream's budget-clamp + two new constants. Verify `getMaxOutputTokensForModel` import path resolves.
3. `models.ts` — apply upstream's per-entry data edits onto the fork's copies of each target model; leave fork-custom models untouched. Confirm **Sol retains `max`** while Terra/Luna drop it.
4. `utils.test.ts` — **consistency-critical:** data and assertions must move together. Update the fork's `claude-sonnet-4-6 → 128000` assertion to match the models.ts change; adopt upstream's retired-ID → current-ID swaps. Keep the fork's added tests.

### Post-merge verification focus

- `bun run test apps/sim/providers/utils.test.ts` and `apps/sim/providers/google/utils.test.ts` (the 64k→128k assertion is the likeliest breakage if data/test drift).
- Sanity: gpt-5.6 Sol still exposes `max`; gemini-2.5-flash `none` now emits `thinkingBudget:0`.

### Open decisions requiring human input

**None.** Fully resolvable from codebase + merge policy + ledger (shared-infra data fix, no fork-owned overlap, no competing edits). No PR question posted per the grill skill's "explore first / don't ask if the codebase answers it" rule.


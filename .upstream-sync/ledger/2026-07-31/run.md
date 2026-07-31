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

Single upstream commit `7d1c927a` — simstudioai/sim#5559, `fix(models): correct model catalog data and Gemini thinking-config wire format`. Pure provider/model-catalog correctness + wire-format bug fix. Six files touched, all under `apps/sim/providers/**`; none are in `merge-policy.json` `forkFirst`, `upstreamFirst`, or `manualReview` prefixes.

### Upstream FBIs in this batch (PR #5559)

- **Bug (wire format):** Gemini 2.5-series models were sent `thinkingLevel`, which they reject; only Gemini 3.x accepts it. Fix sends `thinkingBudget` for 2.5-series (`gemini/core.ts`, `google/utils.ts`). Also fixes the "disable thinking" gap for `gemini-2.5-flash`/`flash-lite` — selecting `none` previously sent no `thinkingConfig`, leaving the API's dynamic default ON; now sends explicit `thinkingBudget: 0` (2.5-pro excluded — floor 128, cannot disable).
- **Bug (Anthropic clamp):** `budget_tokens` could be sent `>= max_tokens` for `claude-opus-4-1` at its default thinking level; fix shrinks `budget_tokens` (floored at `ANTHROPIC_MIN_BUDGET_TOKENS = 1024`, headroom `4096`) rather than only clamping `max_tokens` (`anthropic/core.ts`).
- **Data:** `claude-sonnet-4-6` maxOutputTokens 64k → 128k; un-deprecate `gemini-3-flash-preview`; add `thinking` capability to `gemini-2.5-pro/flash/flash-lite` (google + vertex); Bedrock `claude-opus-4-1` marked `deprecated`; retired Claude entries (`claude-opus-4-0`, `claude-sonnet-4-0`, `claude-3-haiku-20240307`) kept as `deprecated:true` (not removed) to preserve `getHostedModels()`/`shouldBillModelUsage()` resolution for saved workflows; `gpt-5.6-sol` retains Sol-exclusive `max` reasoning value, terra/luna do not.

### Fork-owned paths at risk

None. No `forkFirst`/`manualReview` prefix is touched. `providers/models.ts` is shared upstream infra with heavy fork additions (Arena/P2 catalog), but it is not a policy-protected path.

### Conflict surface (merge-tree dry run against HEAD)

- **`apps/sim/providers/utils.test.ts` — CONFLICT (mechanical, fork-first).** Two hunks in `shouldBillModelUsage` tests: fork HEAD asserts `claude-sonnet-4-6`/`claude-opus-4-6` (fork's newest billable models), upstream rewrote the same lines to `claude-sonnet-4-5`/`claude-opus-4-1`. Both model families exist in the merged catalog (verified: models.ts:843/863/903/964), so either side passes; **resolve fork-first (keep HEAD `4-6`)** — the fork's tests should assert the fork's current-generation models. Trivial for the child conflict agent.
- **`apps/sim/providers/models.ts` — clean auto-merge.** Despite heavy fork divergence (1662/1504 vs baseline), upstream's targeted model-entry edits fall in regions the fork did not touch. Verified in the merged tree: 0 conflict markers, `gpt-5.6-sol` keeps `max` / terra+luna don't, maxOutputTokens corrections present.
- **`apps/sim/providers/anthropic/core.ts` — clean auto-merge.** Fork's divergence (8 lines) is an orthogonal prompt-caching feature (`cache_control` import/interface/payload, ~lines 3–312); upstream touches the budget-clamp constants + logic (~lines 82/344). Non-overlapping and semantically independent.
- **`gemini/core.ts`, `google/utils.ts`, `google/utils.test.ts` — clean apply.** Unchanged in fork vs baseline; upstream applies directly.

### Take vs skip

**Take the whole commit.** It is a data-accuracy + wire-format bug fix with direct correctness value (Gemini 2.5 requests currently mis-shaped; Anthropic clamp can emit invalid requests). Nothing overrides fork behavior — the one conflict is a cosmetic test-name clash resolved fork-first, and the fork's prompt-caching change is preserved intact by the auto-merge.

### Open decisions requiring human input

None. Everything resolves mechanically from `merge-policy.json` (fork-first on the single trivial test conflict). No genuine fork-vs-upstream product decision — no PR question posted.


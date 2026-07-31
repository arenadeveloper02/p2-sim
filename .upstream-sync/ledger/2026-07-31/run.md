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

- **1 upstream commit** in range: `7d1c927a` — simstudioai/sim#5559 `fix(models): correct model catalog data and Gemini thinking-config wire format`.
- **No release versions** in range.
- Purely a **provider-catalog + wire-format correction**. Touches 6 files, all upstream-owned provider infra — **no fork-owned product path** (`merge-policy.json` forkFirst/manualReview lists) is touched.

### Upstream FBIs (this batch)

- **fix** (#5559) model-catalog corrections: gpt-5.6 reasoning-effort values (`max` kept only on Sol; removed from Terra/Luna); `claude-sonnet-4-6` maxOutputTokens 64k→128k; retired Claude models (`claude-opus-4-0`, `claude-sonnet-4-0`, `claude-3-haiku-20240307`) kept as `deprecated:true` (not removed — preserves hosted-key/billing resolution for saved workflows); Anthropic `budget_tokens < max_tokens` clamp hardened; `gemini-3-flash-preview` un-deprecated; thinking capability added to gemini-2.5-pro/flash/flash-lite (google + vertex); bedrock `claude-opus-4-1` marked deprecated.
- **fix** (gemini/core.ts) send `thinkingBudget` (not `thinkingLevel`) for Gemini 2.5-series (they reject `thinkingLevel`); explicit `thinkingBudget:0` for 2.5-flash/flash-lite when disabling thinking (2.5-pro excluded — cannot disable).

### Fork-owned paths at risk

- **None.** All 6 files are upstream provider infra. Fork divergence exists on 3 of them but none are policy-protected paths.

### Merge conflict assessment (merge-tree dry run)

- `apps/sim/providers/models.ts` — fork +3168 lines (custom model catalog), upstream +32 lines → **auto-merges clean** (disjoint regions). Upstream's `claude-sonnet-4-6` 64k→128k bump applies over fork's base-value 64k.
- `apps/sim/providers/anthropic/core.ts` — fork adds automatic-prompt-cache imports + `cache_control` payload spread (fork-only feature); upstream edits budget-clamp constants/logic → **auto-merges clean** (disjoint regions). Fork's prompt-cache extension is preserved.
- `apps/sim/providers/gemini/core.ts`, `google/utils.ts`, `google/utils.test.ts` — fork-unchanged → **fast-forward to upstream**.
- `apps/sim/providers/utils.test.ts` — **ONLY conflict**. Both sides edited the `shouldBillModelUsage` "exact matches" block after retiring `claude-sonnet-4-0`/`claude-opus-4-0`: upstream → `4-5`/`4-1`; fork → `4-6`/`4-6` + adds `grok-4-latest` billable, `mothership` non-billable, date-suffixed-ID tests, and new `resolveBlockModelCost`/`normalizeProviderCost`/image-generator describe blocks.

### Resolution decision (mechanical, fork-first per merge-policy)

- **Take FORK side of the `utils.test.ts` conflict.** Upstream's sole intent in the conflicting hunk — stop referencing retired 4-0 models — is already satisfied by the fork (which references newer 4-6 models) and the fork adds strictly more coverage. Nothing from upstream's conflicting hunk is lost.
- **Preserve the non-conflicting upstream hunk in the same file**: line ~718 `getMaxOutputTokensForModel('claude-sonnet-4-6')` must land at **`128000`** (upstream), not the fork's current `64000` — it must stay consistent with the auto-merged `models.ts` (128k). The resolver must not revert this while resolving the adjacent conflict.
- No fork-owned code, no product decision, no schema/migration/auth/registry `manualReview` path involved → **no human question required**.

### Verification to run post-merge (harness)

1. `apps/sim/providers/utils.test.ts` + `google/utils.test.ts` pass.
2. Merged `models.ts` `claude-sonnet-4-6.maxOutputTokens === 128000` and merged `utils.test.ts` line ~718 asserts `128000` (cross-file consistency).
3. Fork's Anthropic automatic-prompt-cache extension (`cache_control` spread in `anthropic/core.ts`) still present after merge.

### Open questions

- **None.** Fully resolvable from codebase + merge-policy (fork-first). No PR comment posted.


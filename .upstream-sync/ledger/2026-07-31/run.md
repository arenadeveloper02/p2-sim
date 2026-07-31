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

## Usage

### child-cluster-1
- **Model:** `claude-sonnet-4-6`
- **Iterations:** 1
- **Input tokens (direct):** 13
- **Input tokens (cache read):** 751,662
- **Input tokens (cache create):** 59,073
- **Input tokens (total):** 810,748
- **Output tokens:** 4,638
- **Cost:** $0.517826 (provider-reported)
### parent-grill-analysis
- **Model:** `claude-opus-4-8`
- **Iterations:** 1
- **Input tokens (direct):** 26
- **Input tokens (cache read):** 721,512
- **Input tokens (cache create):** 55,764
- **Input tokens (total):** 777,302
- **Output tokens:** 11,985
- **Cost:** $1.010425 (provider-reported)

### Totals
- **Total input tokens:** 1,588,050
- **Total output tokens:** 16,623
- **Primary models:** claude-sonnet-4-6, claude-opus-4-8
- **Provider-reported cost:** $1.528251

### Cost by agent
- **child-cluster-1:** $0.517826 (provider-reported)
- **parent-grill-analysis:** $1.010425 (provider-reported)

## Verification

### bun run check

❌ failed

```

   • Packages in scope: @sim/audit, @sim/auth, @sim/db, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running format:check in 21 packages
   • Remote caching disabled

::group::@sim/auth:format:check
cache miss, executing 7b95f933c974b740
$ biome format .
Checked 3 files in 16ms. No fixes applied.
::endgroup::
::group::@sim/realtime-protocol:format:check
cache miss, executing 11ef7410ee5e5d5c
$ biome format .
Checked 5 files in 49ms. No fixes applied.
::endgroup::
::group::@sim/platform-authz:format:check
cache miss, executing 20bfbd17ba902713
$ biome format .
Checked 5 files in 59ms. No fixes applied.
::endgroup::
::group::@sim/security:format:check
cache miss, executing fc2410243714aad2
$ biome format .
Checked 13 files in 68ms. No fixes applied.
::endgroup::
::group::@sim/workflow-renderer:format:check
cache miss, executing ba94021415352e4f
$ biome format .
Checked 12 files in 100ms. No fixes applied.
::endgroup::
::group::@sim/realtime:format:check
cache miss, executing 1065da2db0dc0980
$ biome format .
Checked 32 files in 296ms. No fixes applied.
::endgroup::
::group::@sim/logger:format:check
cache miss, executing d07801b30193037f
$ biome format .
Checked 6 files in 46ms. No fixes applied.
::endgroup::
::group::simstudio:format:check
cache miss, executing db888607b0259b5e
$ biome format .
Checked 3 files in 23ms. No fixes applied.
::endgroup::
::group::@sim/runtime-secrets:format:check
cache miss, executing 54427b0fcf80d46c
$ biome format .
Checked 5 files in 35ms. No fixes applied.
::endgroup::
::group::@sim/workflow-persistence:format:check
cache miss, executing 6a2f322f646254f4
$ biome format .
Checked 8 files in 48ms. No fixes applied.
::endgroup::
::group::@sim/audit:format:check
cache miss, executing 435b10fd6837457b
$ biome format .
Checked 7 files in 30ms. No fixes applied.
::endgroup::
::group::@sim/workflow-types:format:check
cache miss, executing 80f69e46ffb00c04
$ biome format .
Checked 4 files in 38ms. No fixes applied.
::endgroup::
::group::simstudio-ts-sdk:format:check
cache miss, executing e723f477a2f513f3
$ biome format .
Checked 6 files in 60ms. No fixes applied.
::endgroup::
::group::@sim/utils:format:check
cache miss, executing 251fb15243601532
$ biome format .
Checked 22 files in 153ms. No fixes applied.
::endgroup::
::group::@sim/testing:format:check
cache miss, executing 6754342b8949f5f1
$ biome format .
Checked 66 files in 315ms. No fixes applied.
::endgroup::
::group::@sim/emcn:format:check
cache miss, executing 133b9523f844114a
$ biome format .
Checked 189 files in 845ms. No fixes applied.
::endgroup::
::group::docs:format:check
cache miss, executing 42e792dc12ce87af
$ biome format .
Checked 100 files in 1267ms. No fixes applied.
::endgroup::
[;31m@sim/db:format:check[;0m
cache miss, executing d81199a747a5cf87
$ biome format .
schema.ts format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
    3637 3637 │         .on(table.chatId)
    3638 3638 │         .where(sql`${table.chatId} IS NOT NULL`),
    3639      │ - ····runIdIdx:·index('usage_log_run_id_idx')
    3640      │ - ······.on(table.runId)
    3641      │ - ······.where(sql`${table.runId}·IS·NOT·NULL`),
         3639 │ + ····runIdIdx:·index('usage_log_run_id_idx').on(table.runId).where(sql`${table.runId}·IS·NOT·NULL`),
    3642 3640 │       workspaceOccurredAtIdx: index('usage_log_workspace_occurred_at_idx').on(
    3643 3641 │         table.workspaceId,
  

migrations/meta/_journal.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
    1838 1838 │       }
    1839 1839 │     ]
    1840      │ - }
Checked 284 files in 4s
```

## Merge policy

{
  "strategy": "fork-first",
  "description": "Preserve version-5-main behavior by default. Cherry-pick upstream when changes do not override fork-owned paths. Upstream wins on shared infra (deps, CI, security) unless ledger says otherwise.",
  "forkFirst": [
    "apps/sim/tools/arena/",
    "apps/sim/app/api/tools/arena/",
    "apps/sim/app/api/arena/",
    "apps/sim/lib/arena-utils/",
    "apps/sim/blocks/blocks/arena.ts",
    "apps/sim/hooks/queries/arena-clients.ts",
    "apps/sim/app/arenaMixpanelEvents/",
    "apps/sim/public/arena-ai-docs/",
    "apps/sim/app/api/help/arena-help/",
    "apps/sim/tools/p2_docs/",
    "apps/sim/blocks/blocks/p2_docs.ts",
    "apps/sim/lib/hubspot/",
    "apps/sim/tools/unipile/",
    "apps/sim/app/api/tools/unipile/",
    "apps/sim/app/api/unipile/",
    "apps/sim/lib/unipile/",
    "apps/sim/blocks/blocks/unipile.ts",
    "apps/sim/tools/facebook_ads/",
    "apps/sim/app/api/facebook-ads/",
    "apps/sim/blocks/blocks/facebook_ads.ts",
    "apps/sim/tools/presentation/",
    "apps/sim/app/api/tools/presentation/",
    "apps/sim/blocks/blocks/presentation.ts",
    "apps/sim/app/api/figma/",
    "apps/sim/lib/figma-design-generator.ts",
    "apps/sim/app/api/admin/",
    "apps/sim/hooks/queries/mothership-admin.ts",
    "apps/sim/app/chat/",
    "apps/sim/lib/branding/",
    "apps/sim/lib/auth/session-cookie-domain.ts",
    "apps/sim/lib/auth/legacy-session-cookie-clears.ts",
    "apps/sim/app/api/auth/clear-domain-session-cookies/",
    "apps/sim/lib/users/is-client-user.ts",
    "apps/sim/lib/workspaces/is-admin-workspace.ts",
    "apps/sim/lib/permission-groups/",
    "scripts/deploy-ec2-ghcr.sh",
    "scripts/deploy-ec2-local-build.sh",
    "scripts/ci/ghcr-next-branch-tag.sh",
    "docker-compose.p2prod.yml",
    "docker-compose.test-env.yml",
    "docker-compose.local-build.yml",
    "docker-compose.dev-env.yml",
    "docker-compose.sandbox.yml",
    "bunfig.toml"
  ],
  "upstreamFirst": [
    "apps/sim/lib/copilot/genera


# Upstream Sync Run — 2026-08-04

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `1b9e0f25`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 518

## Grill analysis

Skipped on resume. Human answers were recorded in `grill-log.md` / `qa-history.jsonl` — do not re-ask the same decisions.

## Usage

### child-cluster-1
- **Model:** `gpt-5.6-luna`
- **Iterations:** 1
- **Input tokens (direct):** 102,935
- **Input tokens (cache read):** 1,823,079
- **Input tokens (cache create):** 0
- **Input tokens (total):** 1,926,014
- **Output tokens:** 18,499
- **Cost:** $0.079247 (estimated fallback)

### Totals
- **Total input tokens:** 1,926,014
- **Total output tokens:** 18,499
- **Primary models:** gpt-5.6-luna
- **Total cost:** $0.079247
- **Estimated cost (fallback):** $0.079247

### Cost by agent
- **child-cluster-1:** $0.079247 (estimated fallback)

## Status

awaiting_input

## Open questions

Grill left unanswered product decisions in `open-questions.md`. Merge will not start until `/upstream-sync resume`.

## Format

✅ `bun run format` (pre-verify autofix)

## Verification

Verification is **advisory** — failures do not block the sync. Review and fix on the draft PR as needed.

### bun run check

❌ failed

```

   • Packages in scope: @sim/audit, @sim/auth, @sim/browser-protocol, @sim/db, @sim/desktop, @sim/desktop-bridge, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/terminal-protocol, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running format:check in 25 packages
   • Remote caching disabled

::group::simstudio-ts-sdk:format:check
cache miss, executing 69fe2c650ec4955a
$ biome format .
Checked 6 files in 62ms. No fixes applied.
::endgroup::
::group::@sim/workflow-types:format:check
cache miss, executing d2a15219c4795d40
$ biome format .
Checked 4 files in 18ms. No fixes applied.
::endgroup::
::group::@sim/runtime-secrets:format:check
cache miss, executing fa96e3d91d14beaf
$ biome format .
Checked 5 files in 15ms. No fixes applied.
::endgroup::
::group::@sim/audit:format:check
cache miss, executing 16002eca79f888d0
$ biome format .
Checked 7 files in 40ms. No fixes applied.
::endgroup::
::group::@sim/workflow-persistence:format:check
cache miss, executing 276d5109e80f2ab0
$ biome format .
Checked 10 files in 95ms. No fixes applied.
::endgroup::
::group::@sim/workflow-renderer:format:check
cache miss, executing 3bd74cc6d31f2044
$ biome format .
Checked 13 files in 96ms. No fixes applied.
::endgroup::
::group::@sim/desktop-bridge:format:check
cache miss, executing b7ae9c199dd6c422
$ biome format .
Checked 5 files in 105ms. No fixes applied.
::endgroup::
::group::simstudio:format:check
cache miss, executing 1a315830226ea3e8
$ biome format .
Checked 3 files in 32ms. No fixes applied.
::endgroup::
::group::@sim/security:format:check
cache miss, executing 8bcbb4860d2fef77
$ biome format .
Checked 19 files in 123ms. No fixes applied.
::endgroup::
::group::@sim/auth:format:check
cache miss, executing ea836bbe6b5f56d2
$ biome format .
Checked 3 files in 24ms. No fixes applied.
::endgroup::
::group::@sim/platform-authz:format:check
cache miss, executing 00b26842745ffbe8
$ biome format .
Checked 7 files in 84ms. No fixes applied.
::endgroup::
::group::@sim/logger:format:check
cache miss, executing 4654a31aabcd552d
$ biome format .
Checked 6 files in 80ms. No fixes applied.
::endgroup::
::group::@sim/browser-protocol:format:check
cache miss, executing 4843a62c2a478709
$ biome format .
Checked 3 files in 37ms. No fixes applied.
::endgroup::
::group::@sim/terminal-protocol:format:check
cache miss, executing 9ec78829b5024124
$ biome format .
Checked 3 files in 34ms. No fixes applied.
::endgroup::
::group::@sim/realtime:format:check
cache miss, executing a447929d01b45d93
$ biome format .
Checked 52 files in 631ms. No fixes applied.
::endgroup::
::group::@sim/realtime-protocol:format:check
cache miss, executing d0bc88bd3aefedf4
$ biome format .
Checked 11 files in 107ms. No fixes applied.
::endgroup::
::group::@sim/testing:format:check
cache miss, executing 1975b92479a6bbd0
$ biome format .
Checked 73 files in 520ms. No fixes applied.
::endgroup::
::group::@sim/utils:format:check
cache miss, executing 43cb638c5b7de16f
$ biome format .
Checked 24 files in 175ms. No fixes applied.
::endgroup::
::group::@sim/emcn:format:check
cache miss, executing 02ef5e39e5d86528
$ biome format .
Checked 198 files in 1083ms. No fixes applied.
::endgroup::
::group::@sim/desktop:format:check
cache miss, executing 944f8dceb52cc76c
$ biome format .
Checked 134 files in 1497ms. No fixes applied.
::endgroup::
::group::docs:format:check
cache miss, executing 1a5a31d8c5d710bb
$ biome format .
Checked 102 files in 1857ms. No fixes applied.
::endgroup::
::group::@sim/db:format:check
cache miss, executing ae205447e1f91774
$ biome format .
Checked 309 files in 6s. No fixes applied.
::endgroup::
[;31msim:format:check[;0m
cache miss, executing 68df7b9187d5e872
$ biome format .
providers/models.ts format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
    3491 3491 │    * returned by provider APIs (e.g. `claude-sonnet-4-5-20250514`).
    3492 3492 │    */
    3493      │ - export·function·findCatalogModel(
    3494      │ - ··modelId:·string
    3495      │ - ):·{
         3493 │ + export·function·findCatalogModel(modelId:·string):·{
    3496 3494 │     providerId: string
    3497 3495 │     model: (typeof PROVIDER_DEFINITIONS)[keyof typeof PROVIDER_DEFINITIONS]['models'][number]
  

Checked 12804 files in 17s. No fixes applied.
Found 1 error.
format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  

error: script "format:check" exited with code 1

 Tasks:    22 successful, 23 total
Cached:    0 cached, 23 total
  Time:    18.182s 
Failed:    sim#format:check


$ turbo run format:check
::error::sim#format:check: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run format:check exited (1)
 ERROR  sim#format:check: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run format:check exited (1)
 ERROR  run failed: command  exited (1)
error: script "check" exited with code 1

Command failed: bun run check
$ turbo run format:check
::error::sim#format:check: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run format:check exited (1)
 ERROR  sim#format:check: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run format:check exited (1)
 ERROR  run failed: command  exited (1)
error: script "check" exited with code 1

```

### bun run lint

❌ failed

```
━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    65 │           { 'x-zdesk-jwt': 'not-a-real-jwt' },
    66 │           { orgId: '1', externalId: '2', credentialId: 'cred-1' }
  > 67 │           // biome-ignore lint/suspicious/noExplicitAny: minimal context for the fallback path
       │           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    68 │         ) as any
    69 │       )
  

lib/webhooks/providers/zoho-desk.test.ts:78:11 suppressions/unused ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    76 │           { 'x-zdesk-jwt': 'not-a-real-jwt' },
    77 │           { orgId: '1', externalId: '2', credentialId: 'cred-1', apiDomain: 'https://desk.zoho.eu' }
  > 78 │           // biome-ignore lint/suspicious/noExplicitAny: minimal context for the fast path
       │           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    79 │         ) as any
    80 │       )
  

lib/webhooks/providers/zoho-desk.test.ts:93:11 suppressions/unused ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    91 │           userId: 'user-1',
    92 │           requestId: 'test',
  > 93 │           // biome-ignore lint/suspicious/noExplicitAny: request is unused on these guard paths
       │           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    94 │           request: {} as any,
    95 │         })
  

lib/webhooks/providers/zoho-desk.test.ts:250:9 suppressions/unused ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    248 │         accountId: 'acc-1',
    249 │         userId: 'user-1',
  > 250 │         // biome-ignore lint/suspicious/noExplicitAny: partial owner shape for the test
        │         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    251 │       } as any)
    252 │       vi.mocked(refreshAccessTokenIfNeeded).mockResolvedValue('zoho-token')
  

lib/webhooks/providers/zoho-desk.test.ts:273:9 suppressions/unused ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    271 │         userId: 'user-1',
    272 │         requestId: 'test',
  > 273 │         // biome-ignore lint/suspicious/noExplicitAny: request is unused on this path
        │         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    274 │         request: {} as any,
    275 │       })
  

lib/webhooks/providers/zoho-desk.test.ts:291:9 suppressions/unused ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    289 │         accountId: 'acc-1',
    290 │         userId: 'user-1',
  > 291 │         // biome-ignore lint/suspicious/noExplicitAny: partial owner shape for the test
        │         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    292 │       } as any)
    293 │       vi.mocked(refreshAccessTokenIfNeeded).mockResolvedValue('zoho-token')
  

lib/webhooks/providers/zoho-desk.test.ts:314:9 suppressions/unused ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ! Suppression comment has no effect. Remove the suppression or make sure you are suppressing the correct rule.
  
    312 │         userId: 'user-1',
    313 │         requestId: 'test',
  > 314 │         // biome-ignore lint/suspicious/noExplicitAny: request is unused on this path
        │         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    315 │         request: {} as any,
    316 │       })
  

lib/core/config/api-keys.ts:62:14 lint/suspicious/noDuplicateElseIf ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × This branch can never execute. Its condition is a duplicate or covered by previous conditions in the if-else-if chain.
  
    60 │     if (env.ZAI_API_KEY_2) keys.push(env.ZAI_API_KEY_2)
    61 │     if (env.ZAI_API_KEY_3) keys.push(env.ZAI_API_KEY_3)
  > 62 │   } else if (provider === 'xai') {
       │              ^^^^^^^^^^^^^^^^^^
    63 │     if (env.XAI_API_KEY_1) keys.push(env.XAI_API_KEY_1)
    64 │     if (env.XAI_API_KEY_2) keys.push(env.XAI_API_KEY_2)
  

local-copilot/lib/agent/orchestrator.billing.test.ts:70:25 lint/correctness/useYield ━━━━━━━━━━━━━━━

  × This generator function doesn't contain yield.
  
    69 │ vi.mock('@/local-copilot/lib/agent/specialists/parallel-subagents', () => ({
  > 70 │   runParallelSubagents: async function* () {
       │                         ^^^^^^^^^^^^^^^^^^^^
  > 71 │     return { findings: '', results: [], events: [] }
  > 72 │   },
       │   ^
    73 │ }))
    74 │ 
  

local-copilot/lib/agent/orchestrator.billing.test.ts:76:22 lint/correctness/useYield ━━━━━━━━━━━━━━━

  × This generator function doesn't contain yield.
  
    75 │ vi.mock('@/local-copilot/lib/agent/specialists/specialist-pass', () => ({
  > 76 │   runSpecialistPass: async function* () {
       │                      ^^^^^^^^^^^^^^^^^^^^
  > 77 │     return { domain: 'research', findings: '', toolRoundCount: 0, events: [] }
  > 78 │   },
       │   ^
    79 │ }))
    80 │ 
  

tools/figma/figma_to_html_ai.ts:200:5 lint/correctness/noUnreachable ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × This code will never be reached ...
  
    198 │     }
    199 │ 
  > 200 │     return {
        │     ^^^^^^^^
  > 201 │       success: true,
  > 202 │       output: {
  > 203 │         metadata: data.metadata,
  > 204 │       },
  > 205 │     }
        │     ^
    206 │   },
    207 │ 
  
  i ... because either this statement will throw an exception, ...
  
    115 │     if (!params) {
  > 116 │       throw new Error('Missing required parameters')
        │       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    117 │     }
    118 │ 
  
  i ... this statement will return from the function, ...
  
    146 │       )
    147 │ 
  > 148 │       return {
        │       ^^^^^^^^
  > 149 │         success: true,
         ...
  > 162 │         },
  > 163 │       }
        │       ^
    164 │     } catch (error) {
    165 │       const errorMessage = error instanceof Error ? error.message : String(error)
  
  i ... or this statement will return from the function beforehand
  
    180 │       cleanedHtml = cleanedHtml.trim() // trim ends
    181 │ 
  > 182 │       return {
        │       ^^^^^^^^
  > 183 │         success: false,
         ...
  > 196 │         error: data.error || 'Figma to HTML conversion failed',
  > 197 │       }
        │       ^
    198 │     }
    199 │ 
  

Checked 12804 files in 43s. Fixed 66 files.
Found 4 errors.
Found 9 warnings.
check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  

error: script "lint" exited with code 1

 Tasks:    22 successful, 23 total
Cached:    0 cached, 23 total
  Time:    44.937s 
Failed:    sim#lint


$ turbo run lint
::error::sim#lint: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run lint exited (1)
 ERROR  sim#lint: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run lint exited (1)
 ERROR  run failed: command  exited (1)
error: script "lint" exited with code 1

Command failed: bun run lint
$ turbo run lint
::error::sim#lint: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run lint exited (1)
 ERROR  sim#lint: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run lint exited (1)
 ERROR  run failed: command  exited (1)
error: script "lint" exited with code 1

```

### bun run test

❌ failed

```

   • Packages in scope: @sim/audit, @sim/auth, @sim/browser-protocol, @sim/db, @sim/desktop, @sim/desktop-bridge, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/terminal-protocol, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running test in 25 packages
   • Remote caching disabled

[;31m@sim/db:test[;0m
cache miss, executing 63181e6cac6942a9
$ vitest run
/usr/bin/bash: line 1: vitest: command not found
error: script "test" exited with code 127
::group::@sim/workflow-persistence:test
cache miss, executing 99c24dc26410f451
::endgroup::
::group::@sim/audit:test
cache miss, executing 6c37cfb71f4ab302
::endgroup::
::group::@sim/realtime-protocol:test
cache miss, executing 73b48eb82598a96d
$ vitest run
::endgroup::
::group::@sim/security:test
cache miss, executing 423cdeae94291bca
$ vitest run
::endgroup::
::group::@sim/runtime-secrets:test
cache miss, executing 72e78c533572b708
$ vitest run
::endgroup::
::group::simstudio-ts-sdk:test
cache miss, executing bd07a4cb424f9c8c
$ vitest run
::endgroup::
::group::@sim/testing:test
cache miss, executing 2ecaca1817e52efc
$ vitest run
::endgroup::
::group::@sim/emcn:test
cache miss, executing 5b53501084edb728
$ vitest run
::endgroup::
::group::@sim/desktop:test
cache miss, executing ac91fabd88f3e650
$ vitest run
::endgroup::
::group::@sim/utils:test
cache miss, executing c5c01caeb87a3150
$ vitest run
::endgroup::
::group::@sim/logger:test
cache miss, executing dfaa973b139c131f
$ vitest run
::endgroup::

 Tasks:    0 successful, 12 total
Cached:    0 cached, 12 total
  Time:    1.231s 
Failed:    @sim/db#test


$ turbo run test
::error::@sim/db#test: command (/home/runner/work/p2-sim/p2-sim/packages/db) /home/runner/.bun/bin/bun run test exited (127)
 ERROR  @sim/db#test: command (/home/runner/work/p2-sim/p2-sim/packages/db) /home/runner/.bun/bin/bun run test exited (127)
 ERROR  run failed: command  exited (127)
error: script "test" exited with code 127

Command failed: bun run test
$ turbo run test
::error::@sim/db#test: command (/home/runner/work/p2-sim/p2-sim/packages/db) /home/runner/.bun/bin/bun run test exited (127)
 ERROR  @sim/db#test: command (/home/runner/work/p2-sim/p2-sim/packages/db) /home/runner/.bun/bin/bun run test exited (127)
 ERROR  run failed: command  exited (127)
error: script "test" exited with code 127

```

### bun run build

❌ failed

```

   • Packages in scope: @sim/audit, @sim/auth, @sim/browser-protocol, @sim/db, @sim/desktop, @sim/desktop-bridge, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/terminal-protocol, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running build in 25 packages
   • Remote caching disabled

[;31msim:build[;0m
cache miss, executing f91600b78494de8e
$ bun run build:sandbox-bundles && NODE_OPTIONS='--max-old-space-size=8192' next build
$ bun run ./lib/execution/sandbox/bundles/build.ts
[2026-08-04T10:36:47.684Z] [ERROR] [SandboxBundleBuild] sandbox bundle build failed {
  "message": "Bundle failed",
  "name": "AggregateError"
}
error: script "build:sandbox-bundles" exited with code 1
::group::docs:build
cache miss, executing 101dc744b88a53b6
$ fumadocs-mdx && NODE_OPTIONS='--max-old-space-size=8192' next build
::endgroup::
::group::@sim/desktop:build
cache miss, executing 4971da91428f9475
$ bun run scripts/ensure-pty-prebuilds.ts && bun run scripts/build.ts
• Fetching node-pty prebuild: darwin-arm64@1.2.0-beta.12
• Fetching node-pty prebuild: darwin-x64@1.2.0-beta.12
::endgroup::
::group::simstudio:build
cache miss, executing e7361d873ddfd3dc
$ tsc
::endgroup::
::group::simstudio-ts-sdk:build
cache miss, executing a0bd6b9845f4a7d4
$ tsc
::endgroup::

 Tasks:    0 successful, 5 total
Cached:    0 cached, 5 total
  Time:    1.083s 
Failed:    sim#build


$ turbo run build
::error::sim#build: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run build exited (1)
 ERROR  sim#build: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run build exited (1)
 ERROR  run failed: command  exited (1)
error: script "build" exited with code 1

Command failed: bun run build
$ turbo run build
::error::sim#build: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run build exited (1)
 ERROR  sim#build: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run build exited (1)
 ERROR  run failed: command  exited (1)
error: script "build" exited with code 1

```

## Merge policy

{
  "strategy": "fork-first",
  "description": "Preserve version-5-main behavior by default. Cherry-pick upstream when changes do not override fork-owned paths. Upstream wins on shared infra (deps, CI, security) unless ledger says otherwise. forkFirst is auto --ours; only list true fork-only product or unambiguous fork branding. Shared hotspots go in manualReview.",
  "forkFirst": [
    "apps/sim/tools/arena/",
    "apps/sim/tools/arena-development/",
    "apps/sim/app/api/tools/arena/",
    "apps/sim/app/api/arena/",
    "apps/sim/lib/arena-utils/",
    "apps/sim/blocks/blocks/arena.ts",
    "apps/sim/blocks/blocks/arena-development.ts",
    "apps/sim/hooks/queries/arena-clients.ts",
    "apps/sim/app/arenaMixpanelEvents/",
    "apps/sim/public/arena-ai-docs/",
    "apps/sim/app/api/help/arena-help/",
    "apps/sim/tools/p2_docs/",
    "apps/sim/blocks/blocks/p2_docs.ts",
    "apps/sim/lib/hubspot/",
    "apps/sim/app/api/hubspot/",
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
    "apps/sim/tools/figma/",
    "apps/sim/app/api/figma/",
    "apps/sim/lib/figma-design-generator.ts",
    "apps/sim/app/api/admin/mothership/",
    "apps/sim/app/api/client-channel-mapping/",
    "apps/sim/lib/chat/",
    "apps/sim/lib/branding/",
    "apps/sim/lib/auth/session-cookie-domain.ts",
    "apps/sim/lib/auth/legacy-session-cookie-clears.ts",
    "apps/sim/app/api/auth/clear-domain-session-cookies/",
    "apps/sim/lib/users/is-client-user.ts",
    "apps/sim/lib/workspaces/is-admin-workspace.ts",
    "scripts/deploy-ec2-ghcr.sh",
    "scripts/deploy-ec2-local-build.sh",
    "scripts/deploy-ec2-local-build-sequent

## Post-merge CI fix (2026-08-04)

Merge commit `484a3c3f48` took upstream root `package.json` and dropped fork scripts required by D11 / CI (`check:secrets`, `check:credentials`, `upstream-sync`, `vendor-pricing:*`, `repair:workflow-room-redis-keys`) plus harness deps (`@ai-hero/sandcastle`, `yaml`). Restored those entries and normalized the upstream docs replica URL example so the fork secret scanner accepts the placeholder host.


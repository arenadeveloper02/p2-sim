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

## Format

✅ `bun run format` (pre-verify autofix)

## Verification

Verification is **advisory** — failures do not block the sync. Review and fix on the draft PR as needed.

### bun run check

❌ failed

```

   • Packages in scope: @sim/audit, @sim/auth, @sim/db, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running format:check in 21 packages
   • Remote caching disabled

::group::@sim/workflow-types:format:check
cache miss, executing 80f69e46ffb00c04
$ biome format .
Checked 4 files in 32ms. No fixes applied.
::endgroup::
::group::@sim/auth:format:check
cache miss, executing 7b95f933c974b740
$ biome format .
Checked 3 files in 8ms. No fixes applied.
::endgroup::
::group::simstudio-ts-sdk:format:check
cache miss, executing e723f477a2f513f3
$ biome format .
Checked 6 files in 74ms. No fixes applied.
::endgroup::
::group::@sim/realtime-protocol:format:check
cache miss, executing 11ef7410ee5e5d5c
$ biome format .
Checked 5 files in 45ms. No fixes applied.
::endgroup::
::group::@sim/platform-authz:format:check
cache miss, executing 20bfbd17ba902713
$ biome format .
Checked 5 files in 17ms. No fixes applied.
::endgroup::
::group::simstudio:format:check
cache miss, executing db888607b0259b5e
$ biome format .
Checked 3 files in 25ms. No fixes applied.
::endgroup::
::group::@sim/workflow-persistence:format:check
cache miss, executing 6a2f322f646254f4
$ biome format .
Checked 8 files in 78ms. No fixes applied.
::endgroup::
::group::@sim/testing:format:check
cache miss, executing 6754342b8949f5f1
$ biome format .
Checked 66 files in 296ms. No fixes applied.
::endgroup::
::group::@sim/logger:format:check
cache miss, executing d07801b30193037f
$ biome format .
Checked 6 files in 43ms. No fixes applied.
::endgroup::
::group::@sim/audit:format:check
cache miss, executing 435b10fd6837457b
$ biome format .
Checked 7 files in 62ms. No fixes applied.
::endgroup::
::group::@sim/workflow-renderer:format:check
cache miss, executing ba94021415352e4f
$ biome format .
Checked 12 files in 103ms. No fixes applied.
::endgroup::
::group::@sim/runtime-secrets:format:check
cache miss, executing 54427b0fcf80d46c
$ biome format .
Checked 5 files in 42ms. No fixes applied.
::endgroup::
::group::@sim/utils:format:check
cache miss, executing 251fb15243601532
$ biome format .
Checked 22 files in 187ms. No fixes applied.
::endgroup::
::group::@sim/emcn:format:check
cache miss, executing 133b9523f844114a
$ biome format .
Checked 189 files in 674ms. No fixes applied.
::endgroup::
::group::@sim/security:format:check
cache miss, executing fc2410243714aad2
$ biome format .
Checked 13 files in 52ms. No fixes applied.
::endgroup::
::group::@sim/realtime:format:check
cache miss, executing 1065da2db0dc0980
$ biome format .
Checked 32 files in 191ms. No fixes applied.
::endgroup::
::group::docs:format:check
cache miss, executing 42e792dc12ce87af
$ biome format .
Checked 100 files in 1039ms. No fixes applied.
::endgroup::
::group::@sim/db:format:check
cache miss, executing b6439e244765f843
$ biome format .
Checked 284 files in 4s. No fixes applied.
::endgroup::
[;31msim:format:check[;0m
cache miss, executing 6d534a4176841e4b
$ biome format .
providers/models.ts format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Formatter would have printed the following content:
  
    3515 3515 │    * returned by provider APIs (e.g. `claude-sonnet-4-5-20250514`).
    3516 3516 │    */
    3517      │ - export·function·findCatalogModel(
    3518      │ - ··modelId:·string
    3519      │ - ):·{
         3517 │ + export·function·findCatalogModel(modelId:·string):·{
    3520 3518 │     providerId: string
    3521 3519 │     model: (typeof PROVIDER_DEFINITIONS)[keyof typeof PROVIDER_DEFINITIONS]['models'][number]
  

Checked 11244 files in 13s. No fixes applied.
Found 1 error.
format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  

error: script "format:check" exited with code 1

 Tasks:    18 successful, 19 total
Cached:    0 cached, 19 total
  Time:    15.064s 
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

   • Packages in scope: @sim/audit, @sim/auth, @sim/db, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running lint in 21 packages
   • Remote caching disabled

::group::@sim/realtime-protocol:lint
cache miss, executing 0122da9ed0cc036d
$ biome check --write --unsafe .
Checked 5 files in 99ms. No fixes applied.
::endgroup::
::group::@sim/workflow-types:lint
cache miss, executing 6903535170672abf
$ biome check --write --unsafe .
Checked 4 files in 76ms. No fixes applied.
::endgroup::
::group::@sim/workflow-renderer:lint
cache miss, executing 26cec225a2bccef4
$ biome check --write --unsafe .
Checked 12 files in 127ms. No fixes applied.
::endgroup::
::group::simstudio-ts-sdk:lint
cache miss, executing c86521201f82f1d8
$ biome check --write --unsafe .
Checked 6 files in 200ms. No fixes applied.
::endgroup::
::group::simstudio:lint
cache miss, executing 3b3448794fd8d67a
$ biome check --write --unsafe .
Checked 3 files in 144ms. No fixes applied.
::endgroup::
::group::@sim/logger:lint
cache miss, executing 101959f903fffb42
$ biome check --write --unsafe .
Checked 6 files in 177ms. No fixes applied.
::endgroup::
::group::@sim/security:lint
cache miss, executing f0d899d639617b3d
$ biome check --write --unsafe .
Checked 13 files in 186ms. No fixes applied.
::endgroup::
::group::@sim/utils:lint
cache miss, executing 07ed1635ff1bad02
$ biome check --write --unsafe .
Checked 22 files in 296ms. No fixes applied.
::endgroup::
::group::@sim/runtime-secrets:lint
cache miss, executing 0affd3cfd3a3ca22
$ biome check --write --unsafe .
Checked 5 files in 117ms. No fixes applied.
::endgroup::
::group::@sim/auth:lint
cache miss, executing 9bca023c18774e05
$ biome check --write --unsafe .
Checked 3 files in 54ms. No fixes applied.
::endgroup::
::group::@sim/platform-authz:lint
cache miss, executing ab14447a9def3247
$ biome check --write --unsafe .
Checked 5 files in 110ms. No fixes applied.
::endgroup::
::group::@sim/audit:lint
cache miss, executing b1f8ee93290662d5
$ biome check --write --unsafe .
Checked 7 files in 142ms. No fixes applied.
::endgroup::
::group::@sim/workflow-persistence:lint
cache miss, executing 52e90ffa1f215c7b
$ biome check --write --unsafe .
Checked 8 files in 168ms. No fixes applied.
::endgroup::
::group::@sim/testing:lint
cache miss, executing 3e85379ba14ee220
$ biome check --write --unsafe .
Checked 66 files in 765ms. No fixes applied.
::endgroup::
::group::@sim/realtime:lint
cache miss, executing 92bc76cba3601506
$ biome check --write --unsafe .
Checked 32 files in 799ms. No fixes applied.
::endgroup::
::group::@sim/emcn:lint
cache miss, executing 7c9037a01b46da77
$ biome check --write --unsafe .
Checked 189 files in 2s. No fixes applied.
::endgroup::
::group::docs:lint
cache miss, executing 2fddc1ac6696b586
$ biome check --write --unsafe .
Checked 100 files in 1825ms. No fixes applied.
::endgroup::
::group::@sim/db:lint
cache miss, executing 0e4794115b454eed
$ biome check --write --unsafe .
Checked 284 files in 8s. No fixes applied.
::endgroup::
[;31msim:lint[;0m
cache miss, executing cf989fe94f984959
$ biome check --write --unsafe .
app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/highlight.ts:16:24 lint/complexity/noUselessStringRaw ━━━━━━━━━━

  i String.raw is useless when the raw string doesn't contain any escape sequence.
  
    14 │  * the closing `==` still terminates the run.
    15 │  */
  > 16 │ const HIGHLIGHT_BODY = String.raw`(?:[^=]|=(?!=))+?`
       │                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    17 │ const HIGHLIGHT_TOKEN = new RegExp(String.raw`^==(?!\s)(${HIGHLIGHT_BODY})(?<!\s)==`)
    18 │ /** Input/paste rule form (anchored on a preceding boundary) so typing `==x==` toggles the mark. */
  
  i Remove the String.raw call beacause it's useless here, String.raw can deal with string which contains escape sequence like \n, \t, \r, \\, \", \'.
  

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
  
Checked 11244 files in 36s. Fixed 66 files.
Found 3 errors.
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
  

check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  

error: script "lint" exited with code 1

 Tasks:    18 successful, 19 total
Cached:    0 cached, 19 total
  Time:    38.091s 
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
b/uploads/providers/blob/client.ts,title=lib/uploads/providers/blob/client.test.ts > Azure Blob Storage Client > deleteFromBlob > should delete a file from Azure Blob Storage,line=97,column=11::Error: Azure Blob Storage credentials are missing – set AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in your environment.%0A ❯ getBlobServiceClient lib/uploads/providers/blob/client.ts:97:11%0A ❯ Module.deleteFromBlob lib/uploads/providers/blob/client.ts:483:25%0A ❯ lib/uploads/providers/blob/client.test.ts:190:7%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/uploads/providers/blob/client.ts,title=lib/uploads/providers/blob/client.test.ts > Azure Blob Storage Client > getPresignedUrl > should generate a presigned URL for Azure Blob Storage,line=97,column=11::Error: Azure Blob Storage credentials are missing – set AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in your environment.%0A ❯ getBlobServiceClient lib/uploads/providers/blob/client.ts:97:11%0A ❯ Module.getPresignedUrl lib/uploads/providers/blob/client.ts:183:29%0A ❯ lib/uploads/providers/blob/client.test.ts:202:22%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/local-copilot/lib/agent/specialists/specialist-pass.ts,title=local-copilot/lib/agent/specialists/specialist-pass.billing.test.ts > executeSpecialistLoop billing > routes model and tool cost through the shared turn accumulator without recordModelUsage,line=112,column=33::TypeError: Cannot read properties of undefined (reading 'tryEnter')%0A ❯ Module.executeSpecialistLoop local-copilot/lib/agent/specialists/specialist-pass.ts:112:33%0A ❯ local-copilot/lib/agent/specialists/specialist-pass.billing.test.ts:98:11%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/auth/oauth/token/route.test.ts,title=app/api/auth/oauth/token/route.test.ts > OAuth Token API Routes > POST handler > should return access token successfully,line=63,column=31::AssertionError: expected 401 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 401%0A%0A ❯ app/api/auth/oauth/token/route.test.ts:63:31%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/auth/oauth/token/route.test.ts,title=app/api/auth/oauth/token/route.test.ts > OAuth Token API Routes > POST handler > should handle workflowId for server-side authentication,line=98,column=31::AssertionError: expected 401 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 401%0A%0A ❯ app/api/auth/oauth/token/route.test.ts:98:31%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/auth/oauth/token/route.test.ts,title=app/api/auth/oauth/token/route.test.ts > OAuth Token API Routes > GET handler > should return access token successfully,line=334,column=31::AssertionError: expected 401 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 401%0A%0A ❯ app/api/auth/oauth/token/route.test.ts:334:31%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > returns 499 when a non-SSE execution is cancelled by client disconnect,line=307,column=29::AssertionError: expected 500 to be 499 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 499%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:307:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > rejects large MCP bridge outputs instead of returning large-value refs,line=340,column=29::AssertionError: expected 500 to be 413 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 413%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:340:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > does not trust client-spoofed MCP bridge headers on API key executions,line=380,column=29::AssertionError: expected 500 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:380:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > keeps trusted internal MCP bridge executions on the JSON envelope path,line=415,column=29::AssertionError: expected 500 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:415:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > preserves authenticated-user actor semantics for trusted MCP bridge calls,line=459,column=29::AssertionError: expected 500 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:459:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts,title=lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts > handleEditOperation nestedNodes merge > updates inputs on matched children without changing their ID,line=313,column=48::AssertionError: expected undefined to be 'New prompt' // Object.is equality%0A%0A- Expected:%0A"New prompt"%0A%0A+ Received:%0Aundefined%0A%0A ❯ lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts:313:48%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts,title=lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts > handleEditOperation nestedNodes merge > recursively updates an existing nested loop and preserves grandchild IDs,line=357,column=70::AssertionError: expected undefined to be 'Updated prompt' // Object.is equality%0A%0A- Expected:%0A"Updated prompt"%0A%0A+ Received:%0Aundefined%0A%0A ❯ lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts:357:70%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/markdown-parse.test.ts,title=app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/markdown-parse.test.ts > chunked parse — property test over randomized documents > chunked === one-shot for every document%2C and idempotent for every editable one,line=196,column=3::Error: Test timed out in 30000ms.%0AIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".%0A ❯ app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/markdown-parse.test.ts:196:3%0A%0A
error: script "test" exited with code 1

 Tasks:    9 successful, 10 total
Cached:    0 cached, 10 total
  Time:    8m39.837s 
Failed:    sim#test


$ turbo run test
::error::sim#test: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run test exited (1)
 ERROR  sim#test: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run test exited (1)
 ERROR  run failed: command  exited (1)
error: script "test" exited with code 1

Command failed: bun run test
$ turbo run test
::error::sim#test: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run test exited (1)
 ERROR  sim#test: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run test exited (1)
 ERROR  run failed: command  exited (1)
error: script "test" exited with code 1

```

### bun run build

❌ failed

```

   • Packages in scope: @sim/audit, @sim/auth, @sim/db, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running build in 21 packages
   • Remote caching disabled

::group::simstudio:build
cache miss, executing d986311ed754e393
$ tsc
::endgroup::
::group::simstudio-ts-sdk:build
cache miss, executing 671514ff7495b37f
$ tsc
::endgroup::

$ turbo run build

Command failed: bun run build
$ turbo run build

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


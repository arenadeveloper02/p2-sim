# Upstream Sync Run — 2026-08-04

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `1b9e0f25`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 518

## Grill analysis

### Conflict surface (measured, not estimated)

| Metric | Count |
|---|---|
| Files the fork changed since merge-base | 1578 |
| Files upstream changed since merge-base | 4903 |
| **Files both changed (real conflict surface)** | **436** |
| Upstream-deleted ∩ fork-modified (delete/modify) | 5 |

Overlap concentration: `apps/sim/app/workspace` (81), `apps/sim/app/api` (47),
`apps/sim/lib/copilot` (35), `apps/sim/lib/api` (18), `apps/sim/blocks/blocks` (16),
`apps/sim/lib/workflows` (14), `apps/sim/app/(interfaces)` (14), `packages/db` (7).

Only **one** `forkFirst` path was touched upstream in this range (`bunfig.toml`), and the
fork never customised that file — so the `forkFirst` list caused **no silent upstream drops**
this run. Fork-owned integration code (Arena, Unipile, Facebook Ads, Presentation, Figma,
p2_docs, local-copilot) was untouched by upstream.

---

### 🔴 BLOCKING FINDING — drizzle journal high-water collision will silently skip 6 upstream migrations

This is the highest-severity item in the run and it does **not** surface as a merge conflict,
does not fail CI, and does not fail on a fresh database. It only breaks already-deployed
environments.

**Mechanism.** `drizzle-orm/pg-core` `dialect.migrate()` (verified in
`node_modules/drizzle-orm/pg-core/dialect.cjs:59-69`) reads **one** row:

```sql
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1
```

and then applies a migration only when `Number(lastDbMigration.created_at) < migration.folderMillis`.
It is a single high-water timestamp, not a per-file ledger.

**The collision.** Fork and upstream both allocated idx 0258–0261, and their `when` values interleave:

| journal `when` | side | tag |
|---|---|---|
| 1783620533559 | upstream | `0258_gigantic_lady_mastermind` |
| 1783722352108 | upstream | `0259_slack_native_routing` |
| 1783810442774 | upstream | `0260_unknown_sinister_six` |
| 1784043925919 | upstream | `0261_tranquil_donald_blake` |
| 1784114015298 | **fork** | `0258_deployed_chat_thread_metadata` |
| 1784224314431 | upstream | `0262_strong_storm` |
| 1784252317428 | upstream | `0263_workflow_fork_sync_excluded` |
| 1784269680693 | **fork** | `0259_organization_oauth_apps` |
| 1784346820597 | **fork** | `0260_organization_oauth_apps_allowed_workspaces` |
| **1784346920598** | **fork** | `0261_local_copilot_user_memory` ← **prod high-water** |
| 1784680777879 … 1785776917545 | upstream | `0264…0281` |

Any existing Arena environment has already applied the fork's 0258–0261, so its
`max(created_at)` is **1784346920598**. After the merge, drizzle applies only
`0264…0281` and **silently skips upstream 0258, 0259, 0260, 0261, 0262, 0263** —
their `folderMillis` is below the high-water mark.

**What the skipped six actually create** (so the blast radius is not hypothetical):

- `webhook_path_claim` — **table never created**
- `workflow_deployment_operation` — **table never created** (+ 6 indexes) → the whole
  deployment state machine from #5680 / #5841 / #6229 runs against a missing table
- `webhook` — 8 columns (Slack native routing #5892, registration status/generation)
- `workspace` — 4 columns
- `paused_executions` — 1 column (resume path, #6187)
- `workspace_files` — 1 column
- `workflow` — `fork_sync_excluded` (#5727)
- 8 supporting indexes

Net effect: green CI, green fresh-install, **hard runtime failures in production** on deploy,
webhook registration, execution resume, and file paths.

**Aggravating factor.** Fork migrations `0258`, `0259`, `0260` are **not idempotent** —
plain `ALTER TABLE … ADD COLUMN` / `CREATE TABLE` with no `IF NOT EXISTS`
(only `0261_local_copilot_user_memory` is guarded). So naive renumbering to `0282+` makes
drizzle *replay* them on prod and they will **fail** on duplicate column/table, wedging the
`migrations` service in `docker-compose.p2prod.yml`.

**Recommended remediation** (see Q1 — needs human sign-off because it touches prod DB state):

1. Renumber fork `0258→0282`, `0259→0283`, `0260→0284`, `0261→0285` (file + journal `idx`),
   stamping `when` values just above upstream's `0281` (`1785776917545`).
2. Rewrite those four files to be replay-safe (`ADD COLUMN IF NOT EXISTS`,
   `CREATE TABLE IF NOT EXISTS`, guarded index/FK adds) so the replay on an
   already-migrated database is a no-op.
3. Re-stamp upstream `0258–0263`'s `when` into the free window
   `(1784346920598, 1784680777879)` — 334M ms of headroom, preserving both journal order and
   idx order — so they land above every existing environment's high-water mark.
4. Verify against a restored clone of the Arena production database, not just a fresh one.

Step 3 edits upstream-owned migration metadata and will recur as a conflict in future syncs;
the alternative is one-off `__drizzle_migrations` surgery per environment. That trade-off is
the human's call.

---

### 🔴 BLOCKING FINDING — upstream deleted the deployed-chat voice/TTS stack the fork still ships

Upstream removed voice mode wholesale across #6215, #6218, #6220, #6224, deleting:

- `apps/sim/app/(interfaces)/chat/components/voice-interface/voice-interface.tsx`
- `apps/sim/app/(interfaces)/chat/components/voice-interface/components/particles.tsx`
- `apps/sim/app/(interfaces)/chat/components/input/voice-input.tsx`
- `apps/sim/app/(interfaces)/chat/hooks/use-audio-streaming.ts`
- `apps/sim/app/api/proxy/tts/stream/route.ts`
- `apps/sim/hooks/queries/voice-settings.ts`
- `apps/sim/lib/api/contracts/media/tts-stream.ts`

The fork's **fork-only** `apps/sim/app/(interfaces)/chat/[identifier]/ArenaDeployedChat.tsx`
(~1600 lines) actively depends on all of it: imports `VoiceInterface`, holds
`isVoiceFirstMode` state, pipes `streamTextToAudio` through
`DEFAULT_VOICE_SETTINGS.voiceId = 'EXAVITQu4vr4xnSDxMaL'` (ElevenLabs Bella), and reports
`Prompt Type: Voice` to Mixpanel. This is a live customer-facing Arena feature.

Note the ordering: upstream **hardened** the TTS relay in #6212 (metering + throttling,
v0.7.54) and **then** deleted voice in #6215. If the fork keeps voice, #6212 should be taken
and #6215/#6218 skipped for these paths.

The fork only touched `voice-interface.tsx` cosmetically (3 lines of dark-mode tokens), so
`--ours` alone is not a coherent answer — the sibling files are pure upstream deletions with
no conflict marker, and `apps/sim/app/api/proxy/tts/stream/route.ts` is unmodified by the fork
and will vanish silently. See Q2.

---

### Decisions resolved without asking

Recorded here so Luna conflict-cluster children follow them without re-deriving:

**1. `apps/sim/providers/models.ts` → union.** Set-differenced the three catalogs. The fork's
divergence is small and deliberate: removes `azure/gpt-5-chat`, `deepseek-v4-flash`,
`deepseek-v4-pro`, `mistral-medium-2604`; adds 13 (`gemini-1.0-pro`, `gemini-1.5-*`,
`gpt-4o-mini`, `gpt-4o-search-preview`, `claude-3-7-sonnet-latest`, `azure/gpt-5-chat-latest`,
`DeepSeek-V3.1/V3.2`, `DeepSeek-R1-Distill-Llama-70B`, `Meta-Llama-3.3-70B-Instruct`,
`sambanova` provider). Most of the 3159-line fork diff is provider-block **reordering**, not
deletion. Take all 32 upstream additions (nvidia, zai, glm family, kimi, gemini 3.6 /
3.5-flash-lite, claude-opus-5, cerebras/gemma-4-31b) **and** every upstream structural change
— sunset tiers (#5805), `promptCaching` capability + cache pricing (#5922), auto model
(#6103/#6144) — while preserving the fork's 13 adds and 4 removals.

**2. HubSpot → union.** Both sides added tools on top of base, no overlap:
fork adds `campaigns`, `get_commerce_payment`, `get_import`, `get_object`, `get_pipeline`,
`get_property`, `get_subscription`, `list_association_types`, `list_commerce_payments`,
`list_imports`, `list_objects`, `list_pipelines`, `list_properties`, `list_subscriptions`;
upstream adds `add_list_memberships`, `remove_list_memberships`, `get_list_memberships`,
`get_association_labels`, `delete_{association,company,contact,deal,line_item,ticket}`,
`search_line_items`, `search_quotes`. Union `types.ts` and `index.ts`.
⚠️ Upstream #5635 also **realigned existing** tool params against the live API — run
`/validate-integration hubspot` after the merge; the fork may depend on old param shapes.

**3. `exa_research` → follow upstream's retirement.** Upstream #6074 verified `/research/v1`
returns **HTTP 410 RESEARCH_RETIRED** — the operation was hard-broken in production. Upstream
deletes `apps/sim/tools/exa/research.ts`, adds an Agent operation on `/agent/runs`, and routes
saved `exa_research` workflows to it. Accept the deletion. The fork's addition to that file was
hosted-key support (`exaHosting`) plus one param relaxation — **carry `exaHosting` onto the new
`exa_agent` tool** and update the fork-only `apps/sim/tools/exa-hosting.test.ts`. Keep the
`'exa_research'` entry in `apps/sim/lib/billing/core/historical-workflow-reconciliation.ts`
(historical rows).

**4. Minimal tool registry → follow upstream's removal.** `merge-policy.packageJson.dropScripts`
already drops `dev:full:minimal-registry`, matching upstream #6163. Upstream could delete the
escape hatch because #6153/#6155 replaced it with generated metadata artifacts
(`apps/sim/tools/generated/tool-{ids,metadata,outputs}.ts`) that client paths read instead of
the registry. Complete the removal: drop `apps/sim/tools/registry.minimal.ts`, the `dev:minimal`
script in `apps/sim/package.json`, and the two `registry.minimal.ts` aliases in
`apps/sim/next.config.ts:28,45`.

**5. `apps/desktop/` (157 files, #5998) → take.** Purely additive, zero conflict, inert unless
built. Skipping it would mean re-excluding it every future sync and diverging on the shared
files its follow-ups touched (#6098/#6109 traffic-light padding across
`apps/sim/app/workspace/**`). Cost accepted: Electron deps enter the `apps/*` install graph and
`check:desktop-bridge` / `check:desktop-ipc` join the audit suite. Added to `upstreamFirst` so
future syncs never spend an agent on it. Upstream's `trustedDependencies` gains `isolated-vm`
(#5935) — take that too.

**6. `.github/workflows/ci.yml` → fork-first, skipping upstream's desktop + Blacksmith jobs.**
Both sides rewrote it (fork +235/-51, upstream +496/-101). The fork owns an entirely different
pipeline (GHCR + ECR + EC2, swap allocation, `check:secrets`, own tag scheme). Upstream's
additions need a Blacksmith org and Apple signing secrets the fork does not have. Skipped
upstream items are logged in `skipped.md`. Moved to `manualReview` (not `forkFirst`) so a future
agent always looks rather than silently reverting.

**7. `.github/workflows/test-build.yml` → take upstream, re-apply the fork's 2 lines.** The
fork's only change is the `Check committed secrets` → `bun run check:secrets` step; upstream
rewrote the file (+156/-31) with timeouts, docs-only skip, fork-isolated caches, Node pin, and
runner sizing. Take upstream and re-insert the fork's step.

**8. `bunfig.toml` → upstream lands, and that is correct.** The fork's copy is byte-identical to
the merge-base, so despite the `forkFirst` entry there is no conflict and upstream's
`minimumReleaseAge = 604800` supply-chain gate (#5523) applies. ⚠️ Consequence: fork-only
dependencies must now clear a 7-day age gate, and upstream's `minimumReleaseAgeExcludes`
comments name expiry dates already in the past (2026-07-24 → 2026-08-03). Watch
`bun install --frozen-lockfile` in verification.

**9. Scheduler → keep Trigger.dev; do not wire upstream's cron container into fork compose.**
Upstream added `docker/cron.Dockerfile` + `docker/crontab` + `docker/cron-entrypoint.sh` and a
`check:cron-parity` gate because Compose self-hosters had no scheduler. The fork drives the same
jobs through Trigger.dev (`apps/sim/background/*`, deployed from CI) and has no `CRON_SECRET` or
cron service in any `docker-compose*.yml`. The new files land unused; parity holds because both
sides of the gate are upstream-owned. ⚠️ Ledger note: upstream's crontab now includes jobs the
fork has no Trigger.dev task for — `cleanup-sandbox-images`, `reconcile-inbox-entitlement`,
`renew-subscriptions`, `workspace-events/poll`. Confirm coverage separately.

**10. Branding assets → fork-first.** The fork rebranded `apps/sim/public/favicon/*`,
`apps/sim/public/icon.svg`, and rewrote `components/emails/components/email-footer.tsx`
(157 lines). Upstream's Sim wordmark / favicon / OG / email-footer work (#5587, #5802, #5803,
#f3582ed1) plus the Discord→Slack and LinkedIn-redirect footer changes (#5653, #5654) must not
overwrite Arena branding. Added to `forkFirst`. `apps/sim/ee/whitelabeling/` (fork +388/-154)
and `email-layout.tsx` go to `manualReview` — upstream improvements there may still be worth
taking.

**11. Folder-table cutover → migrate fork code, do not just take `--ours`.** Upstream migration
`0276_drop_legacy_folder_tables` drops `workflowFolder` and `workspaceFileFolder` in favour of
the generic `folder` table keyed by `folderResourceTypeEnum` (#6014, #6025, #6037, #6045, #6051).
Nine fork-modified files still reference the dropped tables. Seven are also upstream-modified
(normal conflicts): `app/api/v1/logs/[id]/route.ts`,
`app/workspace/[workspaceId]/w/[workflowId]/workflow.tsx`,
`lib/copilot/chat/workspace-context.ts`, `lib/copilot/tools/handlers/workflow/mutations.ts`,
`lib/logs/fetch-log-detail.ts`, `packages/db/schema.ts`, `packages/testing/src/mocks/schema.mock.ts`.
**Two are fork-only and will therefore produce no conflict marker at all** — they must be
migrated by hand or they compile and then fail at runtime:
`apps/sim/lib/workflows/default-user-workflows/service.ts` and
`apps/sim/lib/logs/fetch-log-detail.test.ts`.

**12. Billing → keep the fork's markup layer on top of upstream's attribution.** Upstream
introduced workspace-routed billing attribution (#5545, #5657, #5698, #6023) and changed
`deriveBillingContext` to account-only semantics. The fork added a reseller markup layer:
`USAGE_LOG_COST_MULTIPLIER` / `scaleUsageLogCost` / `billableReconciliationAmount`,
`usageLogCategoryEnum`, `workflowStatsDaily`, `workflowStatsMonthly`, plus
`scripts/backfill-usage-attribution.ts` and `scripts/reconcile-historical-workflow-costs.ts`.
Take upstream's attribution refactor; preserve the multiplier so it applies to whatever row
attribution selects. Verification gate: billing tests pass **and** `usage_log.cost` is still
multiplied.

**13. `apps/sim/tools/index.ts` → union, treated as a hotspot.** Upstream added billing
attribution propagation, `validateAndPinProxyUrl` (#8867), private-tool-metadata headers, and
resolved-secret trace sanitisation (#6000). The fork owns hosted-key resolution and Arena cost
tracking in the same file. Added to `manualReview`.

**14. `apps/realtime/src/rooms/redis-manager.ts` → re-apply the fork's hook onto upstream's
rewrite.** Upstream rewrote it (+227/-255) for the shared room spine + Yjs (#5991), continuous
access enforcement (#6170), revoked-collaborator eviction (#5917), read-only position blocking
(#6174). The fork's change is small and cohesive: route keys through the fork-only
`@/rooms/workflow-room-keys` helpers and call `ensureHealthyWorkflowRoomKeys()` before hash
writes to heal `WRONGTYPE` corruption (paired with `scripts/repair-workflow-room-redis-keys.ts`).
Re-apply both onto upstream's version.

**15. `apps/sim/lib/auth/auth.ts` → take upstream's refactor, re-apply the Arena block.**
Upstream's +2442 is dominated by #6203 extracting connector definitions out of the file. The
fork's +312 is one cohesive concern: `ARENA_V3_OAUTH_CALLBACK_ORIGINS`,
`devArenaEmbedCallbackOrigins`, `resolveBetterAuthCrossSubdomainCookieDomain()`,
`resolveArenaHubTrustedOrigin()`. Re-apply onto the refactored file. ⚠️ Semantic risk: upstream
#6217 changed callback-URL resolution across SSR/hydration — verify Arena hub cross-subdomain
SSO still works, together with the `forkFirst` files `lib/auth/session-cookie-domain.ts` and
`lib/auth/legacy-session-cookie-clears.ts`.

**16. Knowledge search → take upstream's refactor + hybrid retrieval.** Upstream replaced
`getQueryStrategy` / `handleTagAndVectorSearch` / `handleTagOnlySearch` / `handleVectorOnlySearch`
with `executeKnowledgeSearch`, added billing attribution, a same-workspace guard, and opt-in
hybrid lexical+vector retrieval (#6124). Re-apply the fork's `resolveKnowledgeBaseId`
(name-or-UUID identifier resolution) and its tag/vector schema extensions on top.

**17. Slack → union; extended scopes stay opt-in.** Upstream gated the approval-sensitive Slack
scopes behind `isSlackExtendedScopesEnabled` (#5631, #5977, #5898) and shipped `slack_v2` as a
separate preview-gated block, so nothing in the fork's `blocks/blocks/slack.ts` (+834, no new
`slack_*` operation ids — subblock restructuring only) is displaced. Take upstream; enable the
extended-scopes flag only if Arena's own Slack app is approved for those scopes.

**18. Remaining delete/modify pairs → follow upstream.**
`knowledge/components/base-card/base-card.tsx` (fork +9) and the deploy
`sync-local-draft.ts` / `.test.ts` pair (fork +33) were replaced upstream; re-apply the fork's
intent onto the replacement rather than resurrecting the files.

**19. Turbopack cache flags → take upstream's measured settings.** The fork sets
`turbopackFileSystemCacheForBuild: true` in `apps/sim/next.config.ts`; upstream **disabled** the
persistent build cache after measuring 3.2× faster builds without it (#6080) and re-enabled the
**dev** filesystem cache (#6151). Take upstream on both flags — reversible if the fork's EC2
build measures differently. Keep every other fork addition in that file (monorepo root pin,
`sambanova.ai` image host, extra `serverExternalPackages`, generative-UI
`outputFileTracingIncludes`, `arena-ai-docs` rewrite).

**20. Skills projections are additive — fork harness skills are safe.** `scripts/sync-skills.ts`
projects `.agents/skills/<n>/SKILL.md` → `.claude/commands/` + `.cursor/commands/` and **only
writes, never deletes**, so the fork's `.claude/skills/*` (`upstream-sync`, `upstream-sync-grill`,
`grilling`, `review-upstream-merge`, `diagnosing-bugs`, `tdd`, `add-settings-page`) and its
extra `.claude/commands/*.md` survive untouched. But the fork's `.cursor/commands/` is missing
several projections (including `upstream-sync.md` for its fork-only
`.agents/skills/upstream-sync/`), so `skills:check` will fail until `skills:sync` runs — now in
`regenerateAfterMerge`.

### Merge-policy changes applied this run

- **`forkFirst` +10:** `apps/sim/local-copilot/`, `apps/sim/app/api/local-copilot/`,
  `apps/sim/config/`, `apps/sim/utilities/`, `apps/sim/public/favicon/`,
  `apps/sim/public/icon.svg`, `components/emails/components/email-footer.tsx`,
  `app/(interfaces)/chat/[identifier]/ArenaDeployedChat.tsx`
- **`upstreamFirst` +6:** `apps/sim/tools/generated/`,
  `apps/sim/providers/pi-model-catalog.generated.ts`, `apps/desktop/`, `docker/crontab`,
  `docker/cron.Dockerfile`, `docker/cron-entrypoint.sh`
- **`manualReview` +11:** `apps/sim/tools/index.ts`,
  `apps/sim/app/workspace/[workspaceId]/home/`, `apps/sim/lib/billing/`,
  `apps/sim/lib/logs/execution/`, `apps/sim/lib/workflows/streaming/`,
  `apps/sim/lib/api/contracts/`, `apps/sim/ee/whitelabeling/`, `apps/realtime/src/rooms/`,
  `apps/sim/next.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/test-build.yml`
- **`regenerateAfterMerge` +2:** `bun run tool-metadata:generate` (fork tools must appear in
  `apps/sim/tools/generated/*`, gated by `tool-metadata:check` and
  `check:tool-registry-boundary`), `bun run skills:sync`

### Post-merge verification checklist

1. Migrations replayed against a **restored clone of Arena production**, not a fresh DB — the
   journal defect above is invisible on a fresh DB.
2. `bun run mship:generate` → `bun run tool-metadata:generate` → `bun run skills:sync`, then
   `bun install` (regenerates `bun.lock` under the new 7-day age gate).
3. Audit suite: `check:api-validation`, `check:tool-registry-boundary`, `check:migrations`,
   `check:cron-parity`, `check:boundaries`, `check:realtime-prune`, `mship:check`,
   `tool-metadata:check`, `skills:check`.
4. `grep -rn 'workflowFolder\|workspaceFileFolder'` returns nothing outside historical
   migrations.
5. Billing: `usage_log.cost` still carries the fork multiplier after upstream's attribution
   refactor.
6. Arena hub cross-subdomain SSO after #6203 + #6217.
7. `/validate-integration hubspot` and `/validate-integration exa`.

### Open decisions requiring a human

See `open-questions.md` — two blocking items (migration journal remediation, deployed-chat
voice mode). Everything else above is resolved from merge policy, the codebase, and upstream
commit evidence.

## Usage

### parent-grill-analysis
- **Model:** `claude-opus-5`
- **Iterations:** 1
- **Input tokens (direct):** 160
- **Input tokens (cache read):** 11,063,713
- **Input tokens (cache create):** 194,005
- **Input tokens (total):** 11,257,878
- **Output tokens:** 74,561
- **Cost:** $8.612786 (provider-reported)

### Totals
- **Total input tokens:** 11,257,878
- **Total output tokens:** 74,561
- **Primary models:** claude-opus-5
- **Total cost:** $8.612786
- **Provider-reported cost:** $8.612786

### Cost by agent
- **parent-grill-analysis:** $8.612786 (provider-reported)

## Status

awaiting_input

## Open questions

Grill left unanswered product decisions in `open-questions.md`. Merge will not start until `/upstream-sync resume`.


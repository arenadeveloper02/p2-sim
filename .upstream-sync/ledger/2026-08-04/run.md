# Upstream Sync Run — 2026-08-04

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `1b9e0f25`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 518

## Grill analysis

_Resume mode: yes. `grill-log.md` and `qa-history.jsonl` are empty — no prior human answers to honor or re-ask. `skipped.md` empty. Analysis grounded against the working tree (pre-merge, branch `upstream-sync/2026-08-03T10-08-54`); fork-owned paths verified present except `apps/sim/app/chat` (see §Chat)._

### Upstream FBIs in this batch (27 releases, v0.7.29 → v0.7.55)

High-signal upstream themes, by area:

- **New integrations (additive, upstream-owned):** TikTok (#5504/#5703/#5978), Buffer (#5637), Flint (#5641), ClickUp (#5702/#5708), Rocketlane (#5709), GitLab (#5710/#5743), Instagram (#5568/#6143), Kimi/Moonshot + NVIDIA NIM + Z.ai + xAI hosted-key providers (#5560/#5574/#5716), Zoho Desk (#6157), Outlook calendar (#6041), Logfire (#6075), Exa refresh (#6074), Gong/HubSpot API alignment (#5632/#5635), Claude Managed Agents block (#5778/#6140), Slack v2 preview block + custom-bot creds (#5323/#5800/#5892/#5898/#5977).
- **DB schema / migrations (manualReview):** generic resourceType folder engine (#6037/#6045/#6025), drop legacy folder tables + deferred `folder_id` FKs (#6051), org session policies (#5862), tables select/multi-select/currency columns + saved views + per-table mutation locks (#5873/#5960/#5961/#6106), custom-block child-run billing (#6023), resource pinning (#6014/#6039), workflow_id FK indexes (#4ef7bbad/#6136), role-keyed `dbFor` clients (#5583).
- **Auth / security (upstream-first shared infra):** extract connectors out of `auth.ts` (#6203), better-auth 1.6.23 + trusted-proxy client IP (#5857), SSO DNS domain verification (#5909/#5931), org session lifetime/idle/revocation (#5862), MCP SSRF validate-at-connect + IPv4 pinning + response-body caps (#5823/#5850/#6169), zip-bomb / billion-laughs guards (#5756/#6166/#6176), secret exposure in trace spans (#6000/#18214158), copilot fail-open write-gate closure (#6132), presigned-upload per-type authz (#6175), realtime continuous room-access enforcement (#6170/#5917/#e5d2f7d8), CVE dep bumps (sharp/js-yaml #5848, next #5890/#6077/#6235→reverted #6242, @opentelemetry/core #6182).
- **Providers / models:** Claude Opus 5 (#5925), prompt-caching capability + cache pricing (#5922), Gemini 3.6 Flash / 3.5 Flash-Lite (#5812), Groq/Cerebras/GLM catalog (#5561/#5559), model sunset tiers (#5805), sim auto model (#6103/#6144).
- **Platform / infra:** desktop app (#5998 + hardening #6065/#6109/#6086/#6050), custom sandboxes + Daytona failover (#6071/#5860/#6033), realtime shared room spine + Yjs Files/Tables collab (#5991/#2ccda18f), hybrid lexical+vector KB search (#6124), public v1 import/export API + quota headers (#5999/#6011/#6012/#6014), self-host settings plane + Docker/Helm alignment (#5990/#6216/#6225/#5907/#5939), CI runner/cache churn (many), test db-mock convergence tranches 1–4 (#5861/#5863/#5864/#5866).
- **Registry-refactor touching manualReview paths:** `blocks/registry.ts` no longer reads `BLOCK_REGISTRY` at module scope — config moved to `registry-maps.ts` (#6083); tool-metadata artifacts + client-boundary registry guard (#6153/#6155/#6156). Fork tree already reflects this split (fork blocks live in `registry-maps.ts`).

### Fork-owned paths at risk (from merge-policy.json)

| Path | Upstream pressure this batch | Resolution |
|------|------------------------------|------------|
| `blocks/registry-maps.ts`, `tools/registry.ts` (manualReview) | ~20 new integrations register here; registry-refactor #6083/#6153 | Take upstream structure, re-add fork entries (arena, arena-development, facebook_ads, p2_docs, unipile; presentation is commented out). Mechanical. |
| `packages/db/migrations/`, `packages/db/schema/` (manualReview) | Heavy: folder engine, org sessions, tables columns/views/locks, pinning, FK indexes | Renumber fork migrations after upstream's; collision already visible (`0251`/`0252` fork-named vs upstream drizzle auto-names). Use `db-migrate` skill. Mechanical, needs care. |
| `apps/sim/lib/auth/` (manualReview) + `session-cookie-domain.ts` / `legacy-session-cookie-clears.ts` (forkFirst) | `auth.ts` connector extraction (#6203), better-auth bump (#5857) | Upstream-first on shared auth infra; preserve fork session-cookie files verbatim. |
| `apps/sim/lib/branding/` (forkFirst) | Sim wordmark/favicon/OG churn (#5587/#5990), "Sim"→"Sim Chat" block rename (#5933) | Fork-first: keep Arena branding. Upstream branding on landing/docs (non-fork paths) flows in. Block rename touches `blocks/blocks/sim.ts`, not `lib/branding` — mechanically neutral. |
| `apps/sim/app/chat/` (forkFirst) | Voice-mode removal (#6215/#6218/#6220), `NEXT_PUBLIC_CHAT_DISABLED` (#6137), highlight-to-chat (#6087) | Dir **absent** in fork tree → no conflict; upstream chat changes apply cleanly. |
| `apps/sim/app/api/admin/`, `hooks/queries/mothership-admin.ts` (forkFirst) | Banned-user filter (#5659), recent impersonations (#5750), included-usage/default tweaks | Fork-first: keep fork admin surface. |
| `apps/sim/lib/copilot/generated/` (upstreamFirst) | Copilot tool/skill changes across batch | Regenerate post-merge via `bun run mship:generate` (already in `regenerateAfterMerge`). |
| `apps/sim/lib/hubspot/` (forkFirst) | Upstream HubSpot tool alignment (#5635) touches `tools/hubspot`, not fork `lib/hubspot` | Fork-first on `lib/hubspot`; upstream tool changes are a separate path. |

### Take vs skip

- **Take (upstream-first / additive, no fork-path conflict):** all new integrations, providers/models, security hardening + CVE bumps, realtime spine, KB hybrid search, v1 import/export API, custom sandboxes, desktop app, CI/test infra, folder engine + tables features. These are the bulk of the 518 commits and carry no fork-vs-upstream tension.
- **Preserve fork (fork-first):** Arena/P2/Unipile/Facebook/Presentation integrations, admin/mothership routes, Arena branding, auth session-cookie handling, hubspot lib. Re-apply fork entries on top of upstream registry/schema restructures.
- **Regenerate, don't hand-merge:** `lib/copilot/generated/` via `mship:generate`.
- **Nothing deliberately skipped** — `skipped.md` stays empty unless a child conflict agent finds an upstream change that overrides a fork-owned path (then it records the skip).

### Verified merge-surface findings (second grill pass, measured against `1b9e0f25`)

Re-run of grill on the widened range (480 → 518 commits; delta = v0.7.53–v0.7.55, 38 commits). The delta adds nothing that changes the dispositions above (`#6196` browser/terminal driver, `#6229`/`#6231` execution event-buffer fixes, `#6203` auth connector extraction, `#6225` self-host/Helm alignment, `#6235`→`#6242` next 16.3.0 bump-and-revert — all upstream-owned, additive or shared-infra). What follows are facts measured against the working tree that the previous pass did not have; they are directives for the Luna conflict children.

**Conflict surface, measured.** `git diff --name-only e2fecc86..HEAD` = 1,532 files; `e2fecc86..1b9e0f25` = 4,903 files; **intersection = 428 files** — that is the real conflict candidate set. Top clusters: `app/workspace` (80), `app/api` (46), `lib/copilot` (34, of which only 2 are under `generated/`), `lib/api` (16), `blocks/blocks` (16), `lib/workflows` (14), `app/(interfaces)` (14).

**F1 — drizzle journal collision is a timestamp problem, not a numbering problem (HIGH).**
`packages/db/scripts/migrate.ts` uses stock drizzle `migrate()`, which gates strictly on `folderMillis > created_at of the most recently applied row`. Fork journal = 262 entries ending at idx 261 (`0261_local_copilot_user_memory`, `when` 1784346920598 = 2026-07-18); upstream journal = 281 entries ending at `0281_fixed_madame_web` (`when` 1785776917545 = 2026-08-03). Six upstream migrations carry `when` values **earlier** than the fork's last applied migration and are therefore **silently skipped on any fork database already migrated past fork-0261**:

| idx | tag | adds |
|---|---|---|
| 258 | `gigantic_lady_mastermind` | `webhook_tiktok_credential_id_idx` |
| 259 | `slack_native_routing` | `webhook.routing_key`, drops `webhook.path` NOT NULL |
| 260 | `unknown_sinister_six` | `paused_executions.automatic_resume_retry_count`, `workspace.storage_used_bytes` (+CHECK), `workspace.organization_assigned_at`, 3 index rebuilds |
| 261 | `tranquil_donald_blake` | tables `webhook_path_claim`, `workflow_deployment_operation` |
| 262 | `strong_storm` | `workspace_files.message_id` |
| 263 | `workflow_fork_sync_excluded` | `workflow.fork_sync_excluded` |

Merged upstream app code reads all of these, so the skip is a runtime break on the existing DB, not a cosmetic drift. Compounding facts: fork's `0258`/`0259`/`0260` are **not idempotent** (bare `ADD COLUMN` / `CREATE TABLE` / `CREATE UNIQUE INDEX`), so re-timestamping them to the journal tail would fail on replay; and if they are moved to the tail while **keeping** their original `when`, a **fresh** database skips them instead (the fresh-install path applies strictly in ascending timestamp order). File-level renumbering is still required regardless — fork and upstream both own `0258/0259/0260_snapshot.json`. Escalated as Q1.

**F2 — the deployed-chat glob in merge-policy points at a path that does not exist (HIGH).**
`merge-policy.json` protects `apps/sim/app/chat/`, which is absent from the fork. The fork's deployed chat actually lives at **`apps/sim/app/(interfaces)/chat/`** — 67 files, `+9,171/−532` vs baseline, i.e. a flagship fork surface with **zero** policy protection. Upstream changed 23 files there in this range (`+1,572/−2,138`), including a **full deletion of voice mode** (`#6215`/`#6218`: `voice-interface/`, `voice-input.tsx`, `use-audio-streaming.ts`, `hooks/queries/voice-settings.ts`, `lib/speech/config.ts`, and the `/api/proxy/tts/stream` + `/api/speech/token` server side). The fork touched exactly one voice file (`voice-interface.tsx`, 3 lines, cosmetic), so git surfaces a delete/modify conflict on that one file while the entire server side deletes cleanly — a naive fork-first resolution keeps fork voice UI whose imports upstream just deleted, i.e. a broken build. Voice is all-or-nothing. Escalated as Q2.

**F3 — registry split already landed in the fork; re-add list is fixed.** `apps/sim/blocks/registry-maps.ts` exists on both sides, so `#6083` is not a structural conflict. Fork entries to preserve in `BLOCK_REGISTRY`: `arena`, `facebook_ads`, `p2_docs`, `unipile`, `arena_development`; `presentation` is commented out — **leave it commented**. `BLOCK_META_REGISTRY` carries `unipile: UnipileBlockMeta`. 16 `blocks/blocks/*.ts` files conflict (agent, exa, firecrawl, gmail, google_*, hubspot, image_generator, knowledge, shopify, slack, telegram, video_generator, zoom) — these are upstream-owned block files the fork edited; per-hunk merge, fork wins only on fork-specific additions.

**F4 — `lib/copilot` conflicts are mostly hand-written, not generated.** Only 2 of the 34 conflicting files sit under `generated/`; the rest are `tools/` (13), `chat/` (9), `request/` (8), `resources/` (2). `bun run mship:generate` fixes the generated pair only — the other 32 need real per-hunk resolution.

**F5 — `bunfig.toml` (forkFirst) deliberately disables the supply-chain gate.** Fork sets `minimumReleaseAge = 0`; upstream `#5523` restored a 7-day gate with scoped excludes. Policy is fork-first on this file → **keep the fork's `minimumReleaseAge = 0`**, do not take upstream's block. Noted so no child "fixes" it and wedges `bun install`.

**F6 — legacy-folder drop (`#6051` / `0276`) is low risk for fork code.** `0276_drop_legacy_folder_tables` drops `workflow_folder` and `workspace_file_folders`; no reference to those tables exists in any fork-owned path (`app/api/admin`, `tools/arena`, `app/api/arena`, `lib/arena-utils`). Its prerequisites (`0272`, `0274`) post-date the fork's last migration, so they apply normally.

**F7 — fork carries orphan migration SQL not in the journal.** `0116_populate_user_knowledge_base`, `0148_prompt_config`, `0239_help_support_issue`, `0248_local_copilot`, `0248_workspace_is_personal`, `0249_local_copilot_user_access`, `0250_local_copilot_user_access_trigger`, `0251_local_copilot_user_access_local_only`, `0252_chat_deployment_type` exist on disk but have no `_journal.json` entry — a pre-existing fork pattern (applied out-of-band or dropped from the journal in an earlier sync). Children must **not** try to reconcile these into the journal during conflict resolution; leave them exactly as they are.

### Open decisions requiring a human

Two, both escalated to PR #678 and mirrored in `open-questions.md`:

- **Q1 — DB migration reconciliation strategy** (from F1). Not resolvable from policy: the correct remedy depends on the migration state of the fork's deployed databases, which the repo does not record.
- **Q2 — deployed-chat voice mode** (from F2). A genuine product call on a fork-flagship surface that `merge-policy.json` does not cover, where fork-first and upstream-first both produce a broken intermediate unless chosen wholesale.

Everything else maps to an existing rule: fork-first on the listed prefixes, upstream-first on shared infra (auth/deps/CI/security), manualReview handled mechanically (registry re-add per F3, `mship:generate` per F4). The desktop app (#5998), Slack v2 preview block, browser/terminal driver (#6196) and the ~20 new integrations are additive and upstream-owned — taken by default, no fork-path override, no product tension.

## Usage

### parent-grill-analysis
- **Model:** `claude-opus-5`
- **Iterations:** 1
- **Input tokens (direct):** 1,534
- **Input tokens (cache read):** 2,470,911
- **Input tokens (cache create):** 98,136
- **Input tokens (total):** 2,570,581
- **Output tokens:** 29,775
- **Cost:** $2.604340 (provider-reported)

### Totals
- **Total input tokens:** 2,570,581
- **Total output tokens:** 29,775
- **Primary models:** claude-opus-5
- **Total cost:** $2.604340
- **Provider-reported cost:** $2.604340

### Cost by agent
- **parent-grill-analysis:** $2.604340 (provider-reported)

## Status

awaiting_input

## Open questions

Grill left unanswered product decisions in `open-questions.md`. Merge will not start until `/upstream-sync resume`.


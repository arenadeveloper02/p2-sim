# Upstream Sync Run — 2026-08-04

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `1b9e0f25`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 518

## Grill analysis

Analysis scope: the **518 upstream commits** in `e2fecc86..1b9e0f25` (v0.7.29 → v0.7.55) only.
Sources read before writing: `grill-log.md` (empty), `qa-history.jsonl` (empty), `merge-policy.json`,
`extensibility-notes.md`, `HANDOVER.md`, all 27 release notes in `release-notes.md`, and the full
`fbi-report.md`. Prior-run context: PR #668 (2026-07-31, 429 commits, same baseline) reached the same
grill stage with **no human questions**; this run is a superset of that range and reaches the same
conclusion on every class that run flagged, plus the new decisions below.

### Predicted merge shape (measured, not estimated)

`git merge-tree --write-tree HEAD 1b9e0f25` predicts **249 conflicted files**:

| Type | Count |
|---|---|
| content | 235 |
| modify/delete | 7 |
| add/add | 7 |

Fork changed 1531 files since the baseline; upstream changed 4903; **428 files overlap**.

Conflict clusters (largest first):

| Files | Cluster |
|------:|---------|
| 74 | `apps/sim/lib/**` — `copilot` 16, `core` 8, `billing` 8, `oauth` 7, `workflows` 6, `uploads` 6, `logs` 6, `api` 5 |
| 23 | `apps/sim/app/api/**` (other) |
| 22 | `apps/sim/app/workspace/**` (other) |
| 21 | `apps/sim/tools/**` (exa 6, firecrawl 4, hubspot 2, registry/index/types/params/utils) |
| 17 | `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/**` |
| 11 | `apps/sim/app/workspace/[workspaceId]/home/**` (Sim/mothership chat) |
| 10 | `apps/sim/app/(interfaces)/chat/**` (Arena deployed chat) |
| 7 each | `apps/sim/blocks`, `apps/sim/executor`, `apps/sim/public` (favicons) |
| 6 each | `apps/sim/hooks`, `apps/sim/providers` |
| 5 each | `apps/sim/app/(landing)`, `apps/sim/app/api/chat` |
| 4 | `packages/db/migrations/meta/**` |
| 1 each | `.github/workflows/ci.yml`, `.gitignore`, `apps/sim/.env.example`, `next.config.ts`, `proxy.ts`, `apps/sim/package.json`, `package.json`, `bun.lock`, `packages/db/schema.ts`, `packages/emcn/src/components/modal/modal.tsx`, `apps/realtime/src/rooms/redis-manager.ts`, `apps/docs/.../environment-variables.mdx`, `apps/sim/serializer/index.ts` |

### Fork-owned paths at risk

**`forkFirst` is clean.** Upstream touches **zero** of the 42 `forkFirst` prefixes in
`merge-policy.json` — the `--ours` auto-resolution is a no-op for all of them. Every fork product
surface listed there (Arena, Unipile, Facebook Ads, Presentation, Figma, P2 docs, `lib/hubspot/`,
`lib/chat/`, `lib/branding/`, session-cookie helpers, deploy scripts, compose files, `bunfig.toml`)
survives untouched.

**`manualReview` is where the work is.** Upstream/fork activity per prefix:

| Prefix | upstream files | fork files |
|---|---:|---:|
| `apps/sim/app/(interfaces)/chat/` | 21 | 51 |
| `apps/sim/app/api/chat/` | 12 | 14 |
| `apps/sim/app/api/mothership/` | 14 | 2 |
| `apps/sim/lib/mothership/` | 5 | 0 |
| `apps/sim/lib/auth/` | 29 | 20 |
| `apps/sim/providers/models.ts` | +988/−164 | +1662/−1504 |
| `apps/sim/tools/registry.ts` | +510 | +271 |
| `apps/sim/blocks/registry-maps.ts` | +36/−? | +38 |
| `apps/sim/blocks/blocks/hubspot.ts` | +173/−7 | +702/−10 |
| `packages/db/migrations/`, `packages/db/schema.ts` | 24 new migrations | 4 colliding migrations |
| `apps/sim/lib/permission-groups/` | 1 | 1 |

### Upstream FBIs worth taking (must not be lost)

**Security / CVE** — take all; policy: upstream wins on security.
`b7311622` docx hyperlink `javascript:` XSS · `1b06b6c6` YAML billion-laughs in file-parser ·
`ccc2ec95` `.doc` zip-bomb · `30820fcb` copilot doc-extraction zip-bomb · `18214158` (#6000) secret
exposure in function/agent trace spans · `be8a93de` vertex credential/region binding ·
`a76b9287` copilot attachment key ownership · `51dd0df4` presigned upload context authz ·
`5686b7bb` + `e5d2f7d8` realtime room access enforced continuously / read-only members ·
`f43b52c5` evict revoked collaborators · `d89ab4a8` bounded response bodies in
`secureFetchWithPinnedIP` · `47e8f1eb` SSH/SFTP read cap on received bytes · `e443a97f` isolated-vm
env construction (V8 escape) · `8348592d` fail-open write gates in agent tools · `e90378a5`
workspace role changes confined to members · `3458220e` MCP validate-at-connect SSRF guard ·
`e2e29eed` bounded request-body reads · `1b82b976` custom-block `iconUrl` scheme restriction ·
`eb123330` chat-OTP authType re-check · `d165712d` workspace authz on mothership uploads ·
`1410aae3` email-OTP auto-signup behind `DISABLE_EMAIL_SIGNUP` · `0bc4fb46` metered/throttled
deployed-chat TTS relay · `334c7c81` CodeQL sha256Hex suppression · `6aa3e0e2` RE2 log-grep.
Dep CVEs: `a0a437dc` sharp 0.35.3 + js-yaml 4.3.0 · `78fb2c06`→`f0b79c5c` next 16.2.12 ·
`797f7818` @opentelemetry/core 2.8.0 (CVE-2026-54285) · `856fe0ff` bun 1.3.14 in Docker.
**Net Next version is 16.2.12** — `ed17bb2b` bumped to 16.3.0 and `2977db51` reverted it because the
16.3.0 optimizer deletes live code. Do not land 16.3.0.

**Platform / infra** — `ef7c8e24` settings permissions + admin + billing attribution ·
`2b5a92a3` org session policies · `c083be9d` better-auth 1.6.23 + trusted-proxy client IP ·
`030c4e2a` connector definitions extracted out of `auth.ts` · `513292f1` SSO DNS domain verification ·
`70814bc4` role-keyed `dbFor` clients · `4ef7bbad`/`02311caf` DB indexes and aggregate coverage ·
`10bfb5d1` realtime shared room spine + Yjs · `1d64b92b` desktop app (new `apps/desktop`) ·
`f6bb8e6d` GCS storage · `5eafa869` Gmail API mail provider · `96c67e91` Daytona failover.

**Generated-artifact machinery (new gates)** — `d6e08d38`/`452d82a6`/`e8894a87` serializable tool
metadata + client-boundary guard · `66d1e61b`/`bee45621` canonical skills with generated projections ·
`897eebdf`/`0bcf64a5` registry no longer read at module scope. These add CI gates the fork must
satisfy (see "Post-merge regeneration").

**Product** — mothership v0.8 (`f03b4337`), agent thinking/tool streaming (`d24bc7ec`), prompt
caching + cache pricing (`17d77795`), sunset tiers for blocks and models (`2f31981f`, `f6944b62`),
generic folders engine (`5b7cf991`, `60f2d031`, `a3413cf5`, `cb3611ba`), tables select/multi-select/
currency + saved views + mutation locks, hybrid KB retrieval (`ed23330f`), Sim auto model
(`aeb7eae3`), custom sandboxes (`7798e834`), 12 new integrations (TikTok, Instagram, Buffer, Flint,
ClickUp, Rocketlane, Zoho Desk, Logfire, GitLab ops, Outlook calendar, Exa refresh, slack_v2).

### Resolved decisions (mechanical — Luna children follow these, do not re-ask)

**D1 — DB migrations: renumber fork's four, keep upstream's.**
Both sides added `0258`–`0261`. Upstream's chain runs to `0281`. Renumber fork migrations to
`0282`–`0285` preserving relative order, then rebuild `packages/db/migrations/meta/_journal.json`
(fork journal has 262 entries, upstream 281 → merged journal 285) and regenerate/renumber the
`meta/*_snapshot.json` files. Use the `db-migrate` skill.

| fork (now) | → | new |
|---|---|---|
| `0258_deployed_chat_thread_metadata.sql` | → | `0282_…` |
| `0259_organization_oauth_apps.sql` | → | `0283_…` |
| `0260_organization_oauth_apps_allowed_workspaces.sql` | → | `0284_…` |
| `0261_local_copilot_user_memory.sql` | → | `0285_…` |

`meta/0258_snapshot.json`, `0259_snapshot.json`, `0260_snapshot.json` are **add/add** conflicts —
take upstream's, then regenerate fork snapshots at the new indices. `packages/db/schema.ts` is a
**union**: keep every fork table (`local_copilot*`, `organization_oauth_apps`,
`oauth_custom_app_state`, `deployed_chat` extras, `prompt_config`, help-support, user-KB) and every
upstream table (`folder`, table views, sandboxes, session policy, collab doc state, …).
`0259_organization_oauth_apps.sql` lacks a `-- migration-safe:` annotation; `check:migrations` may
require one after renumbering — add it (additive table creation).

**D2 — Legacy folder tables are dropped; port the one fork consumer.**
Upstream `4793607e` / `0276_drop_legacy_folder_tables.sql` drops `workflow_folder` and
`workspace_file_folders`, and `packages/db/schema.ts` no longer exports `workflowFolder`.
Every upstream-owned consumer is migrated by upstream itself. **One fork-only file breaks:**
`apps/sim/lib/workflows/default-user-workflows/service.ts` (fork-only, absent upstream) imports
`workflowFolder` and queries it to find/create the system default-workflows folder. Port it to the
generic `folder` table with `resourceType: 'workflow'` using upstream's `lib/folders/queries.ts`
helpers. There is no fork-first option here — the table ceases to exist.
Also re-point `apps/sim/lib/logs/fetch-log-detail.test.ts` (fork-modified, upstream-unchanged).

**D3 — Exa: take upstream's refresh, port the fork's hosted-key layer.**
`/research/v1` returns **HTTP 410 RESEARCH_RETIRED** — the fork's `exa_research` tool is already
hard-broken in production. Upstream (`911b958d` #6074) removes it, adds an `agent` operation on
`/agent/runs`, **routes saved `exa_research` workflows to Agent and preserves the
`research[0].text` output shape**, so fork workflows keep resolving. Resolution: take upstream for
`tools/exa/**` and `blocks/blocks/exa.ts`, delete `tools/exa/research.ts`, then re-apply the two
fork additions onto upstream's files — `hosting: exaHosting` (from the fork-only
`apps/sim/tools/exa/hosting.ts`, which uses upstream's own `ToolHostingConfig` pattern) and
`__costDollars: taskData.costDollars` passthrough — on `agent.ts`, `search.ts`, `answer.ts`,
`get_contents.ts`, `find_similar_links.ts`. Update the fork-only test
`apps/sim/tools/exa-hosting.test.ts`, which imports the deleted `exa/research.ts`. Record the
`exa_research` → `exa_agent` operation change in `skipped.md` as a user-visible behavior note.

**D4 — HubSpot: union, neither side loses tools.**
Both sides expanded HubSpot from the same baseline, additively and disjointly.
Fork added ~14 tools (`campaigns.ts` 1498 lines, `get_object`/`list_objects`, `get_pipeline`/
`list_pipelines`, `get_property`/`list_properties`, `get_subscription`/`list_subscriptions`,
`get_commerce_payment`/`list_commerce_payments`, `get_import`/`list_imports`,
`list_association_types`) plus `lib/hubspot/list-account-options.ts`, and edited
`list_contacts.ts` (single-record fetch by id/email) and `list_associations.ts` — **upstream did not
touch either of those two files**, so they merge clean.
Upstream added `add_/remove_/get_list_memberships`, `get_association_labels`, six `delete_*`,
`search_line_items`, `search_quotes`.
Conflicts are only `tools/hubspot/index.ts`, `tools/hubspot/types.ts` and
`blocks/blocks/hubspot.ts` → **union all exports, all types, all block operations and their
`condition` blocks**. Do not drop either side's operations from the `operation` dropdown.
Note: the `hubspot` genericOAuth provider block in `apps/sim/lib/auth/auth.ts` is **not** a fork
customization — it is byte-identical to upstream's, which upstream merely relocated to
`apps/sim/lib/auth/connectors/providers.ts`. Take upstream's location; no duplicate provider.

**D5 — `apps/sim/lib/auth/`: upstream structure, fork Arena blocks re-applied.**
Take upstream's restructured `auth.ts` + `connectors/providers.ts` + better-auth 1.6.23 +
`session-policy.ts` + `security-policy.ts` + `sso/domain-verification.ts` + `stale-session-recovery.ts`
as the base, then re-apply **every** fork block:
`ARENA_V3_OAUTH_CALLBACK_ORIGINS` trusted origins · `devArenaEmbedCallbackOrigins`
(localhost:3001/5173/4173 in development) · `resolveBetterAuthCrossSubdomainCookieDomain()` +
`advanced.crossSubDomainCookies` from `BETTER_AUTH_COOKIE_DOMAIN` · `resolveArenaHubTrustedOrigin()`
from `NEXT_PUBLIC_ARENA_FRONTEND_APP_URL` · the `getMicrosoftOAuthEndpoints` /
`getMicrosoftOAuthTenantId` / `getInternalApiBaseUrl` / `getLoginRedirectUrl` imports and uses.
The fork-only `session-cookie-domain.ts` and `legacy-session-cookie-clears.ts` (both `forkFirst`)
are untouched by upstream. Fork's `sso/domain.ts` and upstream's `sso/domain-verification.ts` are
different modules — keep both.

**D6 — `providers/models.ts`: union, fork model families are load-bearing.**
Fork rewrote the file (+1662/−1504) to add whole `azure/*` and `azure-anthropic/*` families
(`azure/gpt-5.4*`, `azure/gpt-5*`, `azure/gpt-4.1*`, `azure/o3`, `azure/o4-mini`,
`azure/model-router`, `azure-anthropic/claude-opus-4-6|4-5|4-1`, `azure-anthropic/claude-sonnet-4-5`,
`azure-anthropic/claude-haiku-4-5`) and to retain legacy models upstream dropped
(`gpt-4o-mini`, `gpt-4o-search-preview`, `claude-3-7-sonnet-latest`, `claude-3-haiku-20240307`,
`claude-opus-4-0`, `claude-sonnet-4-0`, `claude-sonnet-4-5`).
Keep **all** of those, and take **all** upstream additions and schema changes (NVIDIA NIM, Z.ai,
Kimi/Moonshot, new Groq/Cerebras, Gemini 3.6 Flash / 3.5 Flash-Lite, Claude Opus 5, Sim auto model,
the sunset-tier field, the prompt-caching capability and cache-read/write pricing).
Keep the fork's Azure providers registered in `apps/sim/providers/registry.ts`.
**Do not** tag fork-retained legacy models with upstream's new `legacy`/`deprecated` sunset tiers —
that would surface amber/red deprecation warnings on Arena users' canvases for models the fork
deliberately still supports. Leave them untagged (no warning) unless a human says otherwise.

**D7 — Registries: union.**
`apps/sim/tools/registry.ts` (+271 fork / +510 upstream), `apps/sim/blocks/registry-maps.ts`
(+38 fork / +36 upstream), `apps/sim/blocks/registry.ts` (upstream-only, +39 — takes upstream:
`897eebdf` stops it reading `BLOCK_REGISTRY` at module scope). Union `BLOCK_REGISTRY` and
`BLOCK_META_REGISTRY` alphabetically. Fork entries that must survive: `arena`,
`arena-development`, `chart_generator`, `cost`, `development`, `facebook_ads`, `figma`,
`google_ads_v1`, `image_fusion`, `p2_docs`, `presentation`, `semrush`, `spyfu`, `unipile`.
Upstream entries that must land: tiktok, instagram, buffer, flint, clickup, rocketlane, zoho_desk,
logfire, slack_v2, managed agents, plus the `webhook` block rename (`e737901b`) and the
`Sim` → `Sim Chat` block rename (`f0f98708`).

**D8 — Fork branding wins on icons.** The 7 `apps/sim/public/**` conflicts
(`favicon/{favicon.ico,favicon-16x16,favicon-32x32,apple-touch-icon,android-chrome-192x192,
android-chrome-512x512}.png`, `icon.svg`) are upstream's new Sim wordmark (`f3582ed1`) vs the
fork's Arena marks. **Keep the fork's (`--ours`)** — consistent with `lib/branding/` being
`forkFirst` and the policy's "unambiguous fork branding" carve-out. Add these paths to
`forkFirst` (see extensibility notes).

**D9 — `bunfig.toml`: upstream's supply-chain gate stands.**
The fork side is unchanged from the baseline (`minimumReleaseAge = 0`), so git fast-forwards to
upstream's `minimumReleaseAge = 604800` + `minimumReleaseAgeExcludes` — **no conflict**, and policy
puts security/deps on upstream. If the lockfile bootstrap then fails because a fork-only dependency
is younger than 7 days, add that package to `minimumReleaseAgeExcludes`; **do not** revert
`minimumReleaseAge` to `0`.

**D10 — `.github/workflows/ci.yml`: upstream base, fork deploy jobs re-applied.**
Fork +237/−51, upstream +597/−132 on the same file. Take upstream's as the base (CI is shared
infra) and re-apply the fork's deploy pipeline — the jobs that call `scripts/ci/ghcr-next-branch-tag.sh`
and `scripts/deploy-ec2-*.sh` (all `forkFirst`). `test-build.yml` merges clean (fork side is +2 lines).

**D11 — Root `package.json`: union scripts; the harness must survive.**
Preserve these fork-only scripts: **`upstream-sync`** (`bun run .sandcastle/main.ts` — the harness
itself), `check:credentials`, `check:secrets`, `vendor-pricing:check`, `vendor-pricing:sync`,
`repair:workflow-room-redis-keys`. Take all upstream additions (`tool-metadata:*`, `skills:*`,
`agent-stream-docs:*`, `billing-protocol-contract:*`, `check:tool-registry-boundary`,
`check:cron-parity`, `check:desktop-bridge`, `check:desktop-ipc`, `doctor`, `setup`, `sim`,
`library:covers*`, `desktop-bridge-contract:update`).
**Drop `dev:full:minimal-registry`** — upstream removed the minimal-registry escape hatch
(`03649e93` #6163) and `apps/sim/package.json` no longer has `dev:minimal`, so the fork script
would reference a non-existent target. The fork's now-orphaned `apps/sim/tools/registry.minimal.ts`
should go with it.
`bun.lock` is regenerated by the harness bootstrap — never hand-merge it.

**D12 — Deleted-then-moved modules: re-point, don't resurrect.**
`sync-local-draft.ts` was **moved**, not deleted: upstream relocated it to
`apps/sim/stores/workflows/sync-local-draft.ts`. The fork's addition —
`flushMergedLocalDraftToServer()`, which flushes subblock-store-only values into the normalized
draft tables before a deploy snapshot (fixes deploy silently clearing fields such as image-generator
provider/model) — **must be ported into the new location**, along with its tests from
`deploy/hooks/sync-local-draft.test.ts` → `apps/sim/stores/workflows/sync-local-draft.test.ts`, and
the three fork call sites in `deploy-modal.tsx` (×2) and `use-deployment.ts` re-pointed. Dropping
this silently reintroduces a data-loss bug on deploy.
`knowledge/components/base-card/base-card.tsx` was **replaced**: upstream deleted it and renders
knowledge bases through the shared `apps/sim/app/workspace/[workspaceId]/components/resource/resource.tsx`
+ `components/resource-tile/` primitives (`786c854e` #6202). Re-attach the fork's Arena Mixpanel
instrumentation — `clickKnowledgeBaseEvent({ 'Knowledge Base Name', 'Knowledge Base ID',
'Search keyword' })` from `@/app/arenaMixpanelEvents/mixpanelEvents` — at the KB row/tile click
handler in the merged `knowledge.tsx`, and keep the `searchQuery` passthrough that feeds it.
This is the only one of the fork's 16 `arenaMixpanelEvents` call sites that upstream deleted.

**D13 — Restore the two upstream tests the fork deleted.**
`apps/sim/app/workspace/[workspaceId]/home/hooks/use-chat.test.ts` and
`home/hooks/stream/turn-model-serialize.test.ts` are modify/delete conflicts where **the fork
deleted and upstream modified**. Take upstream's versions and adapt them to fork behavior if they
fail; only delete again as a last resort, and if so record it in `skipped.md` with what coverage is
lost.

**D14 — `apps/sim/local-copilot/` needs import repair, not conflict resolution.**
The fork's Local Copilot is a 77-file **fork-only** product (backed by migrations `0248`–`0251`,
`0261`) that reaches deep into upstream copilot internals: `@/lib/copilot/request/*`,
`@/lib/copilot/tools/*`, `@/lib/copilot/generated/*`, `@/lib/mothership/skills`,
`@/executor/handlers/agent/skills-resolver`. Because it is fork-only it produces **no conflict
markers** — it will fail `bun run check` instead. Known break already identified:
`local-copilot/lib/tools/user-skills.ts` imports `LOAD_USER_SKILL_TOOL_NAME` from
`@/lib/mothership/skills`, which upstream **deleted** in the skills canonicalisation
(`66d1e61b`/`6dcc65be`/`bee45621`); skills now live in `apps/sim/lib/skills/` and
`apps/sim/lib/workflows/skills/`. Expect further breakage from mothership v0.8 (`f03b4337`) and the
agent-stream refactor (`d24bc7ec`) moving copilot request/tool internals. Treat `local-copilot` as a
dedicated post-merge repair cluster driven by type-check output.

**D15 — `apps/sim/app/(interfaces)/chat/**` resolution stance (see Q2 — assumed default).**
Assumed unless the reviewer corrects it: **fork-first on presentation, upstream-first on
auth/security/route contracts.** Concretely — keep the fork's Arena chat product wholesale
(`ArenaDeployedChat.tsx`, `DeployedChatLanding`, `FeedbackView`, `leftNavThread`,
`golden-queries-modal`, `knowledge-results-modal`, `chat-echarts-renderer`, `feedback-box`,
`welcome-message-with-ctas`, `arena-tokens.css`, `utils/{export-chat,thread-date-groups,
clip-description,welcome-message-ctas}`, and the fork's `api/chat/{agents,agentsList,feedback,
history,all-history,threads,memory-api}` routes), and its edits to the shared shell
(`header.tsx`, `input.tsx`, `message.tsx`, `message-container.tsx`, `markdown-renderer.tsx`,
`loading-state.tsx`, `constants.ts`); take upstream on OTP/auth-mode/password/rate-limit and
response-contract changes in `api/chat/{route,utils,[identifier]/route,manage/[id]/route}.ts`
(`eb123330`, `7ee8f46a`, `13772565`, `b0491f11`, `0bc4fb46`).

### Post-merge regeneration (extends `regenerateAfterMerge`)

`bun run mship:generate` alone is no longer sufficient. Upstream added generated artifacts with
**CI check gates in `.github/workflows/test-build.yml`** that fork-added tools and skills will
otherwise fail:

| Run after merge | Guards |
|---|---|
| `bun run mship:generate` | `apps/sim/lib/copilot/generated/**` (`upstreamFirst`) — `mship:check` |
| `bun run tool-metadata:generate` | `tool-metadata:check` — must include every fork tool (arena, unipile, facebook_ads, presentation, figma, p2_docs, semrush, spyfu, google_ads_v1, chart_generation, image_generation, development) |
| `bun run mship-tools:generate` | `mship-tools:check` (tool catalog) |
| `bun run skills:sync` | `skills:check` — projects `.agents/skills/<name>/SKILL.md` into `.claude/commands/` and `.cursor/commands/`. It only ever **writes** projections for skills present in `.agents/skills/`, so the fork's extra `.claude/skills/{upstream-sync,upstream-sync-grill,review-upstream-merge,diagnosing-bugs,tdd,grilling,grill-me,add-settings-page}` are safe. But the fork's `.agents/skills/upstream-sync/` and `.agents/skills/babysit/` **will** be projected — their `SKILL.md` frontmatter must carry `name: <dir>` and a `description:`, and the resulting `.claude/commands/*.md` / `.cursor/commands/*.md` must match byte-for-byte or `skills:check` fails |
| `bun run agent-stream-docs:generate` | `agent-stream-docs:check` |

Also newly gating this PR: `check:tool-registry-boundary` (no client path may import the tool
registry — audit fork client code), `check:migrations` (annotation-aware; see D1),
`check:api-validation:strict`, `check:client-boundary`, `check:boundaries`,
`check:realtime-prune`, `apps/sim/scripts/check-block-registry.ts`.

### Skipped upstream (to record in `skipped.md` after the merge)

Nothing is being deliberately skipped wholesale. Behavior changes to document as "what we miss":

- `exa_research` operation is retired (endpoint 410s); saved workflows are auto-routed to the new
  Exa Agent operation (D3).
- The minimal-registry dev escape hatch is gone (D11).
- Whatever Q1 resolves to — if voice is dropped, the loss is the Arena deployed-chat voice-first
  interface and TTS playback.

### Open decisions requiring a human

Two, both on the Arena deployed-chat surface, written to
`.upstream-sync/ledger/2026-08-04/open-questions.md` and posted on PR #679. Everything else above is
resolved from `merge-policy.json`, the codebase, or upstream's own migration paths.

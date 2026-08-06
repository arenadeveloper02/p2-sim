# Upstream Sync Run — 2026-08-06

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `6c3d11b2`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 23
- **Merge tip:** next-release v0.7.29 (`6c3d11b2`; full upstream HEAD `54a3262f`)

## Grill analysis

### Scope

`e2fecc869..6c3d11b2d` = 23 commits, one release (v0.7.29), **352 upstream files** changed
(+53,572 / −3,636). Of those, **63 files were also touched by the fork** since the merge-base —
that set is the realistic conflict surface. The other 289 are new/upstream-only files that
auto-merge.

### Upstream FBIs in this batch

| Theme | Upstream PRs | What lands |
|---|---|---|
| Model catalog + providers | #5559, #5560, #5561, #5569, #5584 | Catalog data fixes, Gemini thinking-config wire format, **new `nvidia` + `zai` (GLM) providers**, new Groq/Cerebras models, landing compare-chart fix |
| Slack overhaul | **#5323** | Reusable custom Slack bot credentials (`slack-custom-bot` service-account), `slack_v2` **preview-gated** block, redesigned `slack_oauth` trigger, native slack webhook routes, `webhook.routing_key` |
| TikTok integration | #5504 | Block + 9 triggers + tools + OAuth provider (`client_key` quirk) + `TIKTOK_CLIENT_*` env |
| Landing / branding | #5535, #5565, #5582, #5585, #5587 | Enterprise page redesign, **HubSpot tracking script**, Share chip, sr-only logos fix, **Sim wordmark favicon/OG + docs footer** |
| MCP fixes | #5566, #5570 | Caret alignment, tool-schema contract validation, object params → JSON editor |
| Workflow validation | **#5571** | Server-side edge/block validation (`packages/workflow-types` +251, executor, store) |
| Rich markdown editor | #5573 | Image dupe-upload fix, link color under bold/italic/code |
| Enrichments | #5572 | **Removes Icypeas providers** from the work-email / email-verification cascades, "Running" on in-flight cells |
| Custom blocks | #5575 | Hardened delete with usage count, per-input `required` |
| Hosted keys | #5576 | Context.dev added to the rotation pool (`context_dev` BYOK id) |
| Infra | #5552, #5581 | CUDA torch on amd64 for GLiNER (`docker/pii.Dockerfile`), docs favicon/contrast/intros |

### Fork-owned paths at risk

None of the 63 shared files sit under a `forkFirst` prefix — the fork's isolated product code
(Arena / P2 docs / Unipile / Facebook Ads / Presentation / Figma / mothership / branding lib /
deploy scripts) is **untouched by this batch**. The risk is concentrated in shared hotspots the
fork has heavily customized:

| Shared file | fork Δ | upstream Δ | Note |
|---|---|---|---|
| `apps/sim/providers/models.ts` | +1660/−1499 | +397/−4 | Fork comments out deprecated/non-working models, adds `azure-anthropic`, adds pricing coverage |
| `packages/db/schema.ts` | +913/−1 | +34/−7 | Fork: org OAuth apps, local copilot, chat thread metadata |
| `apps/sim/blocks/blocks/slack.ts` | +783/−51 | +98/−16 | Fork added `get_user_channels`, `search_all`, date filters, pagination; relabelled authMethod |
| `apps/sim/lib/oauth/oauth.ts` | +312/−24 | +49/−2 | Fork: org-scoped custom OAuth apps (`lib/oauth/custom-apps.ts`), `unipile_linkedin`, `zoom-admin`, `facebook-ads` |
| `apps/sim/app/api/auth/oauth/utils.ts` | +224/−23 | +106/−11 | Fork: HubSpot shared-tenant alias resolution + `organizationId` plumbing |
| `apps/sim/lib/auth/auth.ts` | +233/−79 | +71/−0 | Upstream is a purely additive TikTok generic-oauth block |
| `apps/sim/components/icons.tsx` | +332/−30 | +57/−0 | Pure additive union both sides |
| `apps/sim/tools/registry.ts` | +271/−10 | +16/−6 | Pure additive union both sides |
| `credential-selector.tsx` | +305/−25 | +39/−11 | Upstream adds the custom-bot credential kind |
| `apps/sim/proxy.ts` | +109/−20 | +7/−4 | Upstream reverted its landing-scoped CSP mid-PR; final delta is small |

### Findings that change the merge plan

#### 1. HubSpot tracking will actually fire on Arena (**blocking — Q1**)

`#5565` adds Sim's HubSpot loader to `apps/sim/app/(landing)/layout.tsx`, gated by `isHosted`:

```tsx
const HUBSPOT_SCRIPT_SRC = 'https://js-na2.hs-scripts.com/246720681.js' as const
{isHosted && (<Script id='hs-script-loader' src={HUBSPOT_SCRIPT_SRC} … />)}
```

The fork **rewrote `isHosted`** (`apps/sim/lib/core/config/env-flags.ts:34`) to be true for
`agent.thearena.ai`, `dev-agent…`, `test-agent…`, `test-v1-agent…`, `sandbox-agent…` **and
`http://localhost:3000`** — not just `sim.ai`. So the gate that makes this inert for upstream's
self-hosters is *open* on every Arena deployment, and landing-page visitor analytics would be
posted to **Sim's** HubSpot portal `246720681`.

`apps/sim/app/(landing)/layout.tsx` is **not** in the conflict set (the fork never edited it) —
git merges it silently, so this needs an explicit directive, not conflict resolution.
Companion surface: `apps/sim/app/(landing)/hubspot-page-view-tracker.tsx` (new) and the
`hs-scripts / hs-analytics / hscollectedforms / hs-banner` hosts added to `STATIC_SCRIPT_SRC` /
`STATIC_CONNECT_SRC` in `apps/sim/lib/core/security/csp.ts`.

This is the only `isHosted`-gated addition in the batch (verified by grepping the full range diff).

#### 2. DB migration collision — renumbering the fork's side would silently skip upstream's

Upstream adds `0258_gigantic_lady_mastermind.sql` (`when` 1783620533559) and
`0259_slack_native_routing.sql` (`when` 1783722352108). The fork already occupies
**0258–0261** (`when` 1784114015298 … 1784346920598) plus snapshots 0258–0260.

The obvious fix — renumber the fork's migrations to 0260–0263 and let upstream keep 0258/0259 —
is **wrong for this fork**. `drizzle-orm/pg-core/dialect.js:62` gates application on:

```js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { … }
```

On any database that has already applied the fork's `0261_local_copilot_user_memory`
(`created_at` 1784346920598), upstream's two migrations have *older* `when` values and would be
**skipped forever** — `webhook.routing_key` never gets created, and #5323's native Slack routing
breaks at runtime. `packages/db/scripts/migrate.ts` uses stock `migrate()`, so there is no
fork-side escape hatch.

**Resolution (self-resolved, S2):** leave the fork's 0258–0261 exactly as they are (zero risk to
already-applied state) and **append** upstream's two files at the tail:

- `0258_gigantic_lady_mastermind.sql` → `0262_gigantic_lady_mastermind.sql`
- `0259_slack_native_routing.sql` → `0263_slack_native_routing.sql`
- journal entries appended at `idx` 262/263 with `when` bumped above 1784346920598
- upstream snapshots renamed to `meta/0262_snapshot.json` / `meta/0263_snapshot.json`; the tail
  snapshot must be reconciled against the merged `packages/db/schema.ts`

Safe on fresh DBs too: upstream's SQL only touches `webhook` (an old table); the fork's 0258–0261
touch chat-thread / org-OAuth-app / local-copilot tables — no interdependency, verified by reading
both SQL sets. SQL bodies stay verbatim (they carry hand-written `COMMIT;` +
`CREATE INDEX CONCURRENTLY` blocks that must not be regenerated).

This becomes the standing rule for this fork — recorded in `extensibility-notes.md`.

#### 3. Branding assets auto-merge past the fork's white-label

`#5587` rewrites `apps/sim/public/favicon/*` and `apps/sim/public/icon.svg` to the Sim wordmark.
The fork rebranded **6 of them** (`android-chrome-192/512`, `apple-touch-icon`, `favicon-16/32`,
`favicon.ico`, `icon.svg`) → those conflict and resolve `--ours`. But
`favicon-96x96.png`, `favicon.svg`, `web-app-manifest-192/512.png` were **never** rebranded by the
fork, so they take upstream's new Sim wordmark with no conflict. Conservative call: `checkoutOurs`
across the whole `apps/sim/public/favicon/` prefix + `icon.svg` so no *new* Sim mark ships into the
Arena white-label without review. `apps/sim/public/landing/*` (enterprise hero + team avatars, needed by
#5535) and `apps/sim/public/logo/` take upstream.

Landing **copy** carries a recurring fork rule confirmed in `footer.tsx` / `hero.tsx`:
`SimWordmark` → `ArenaWordmark`, "Sim is your AI workspace" → "Arena is the AI workspace",
`aria-label='Sim home'` → `'Arena home'`. Upstream's structural edits to those files must be taken
while the Arena strings survive.

#### 4. Slack is a union, not a competing implementation

Initial read suggested the fork had built its own custom-bot support (`'Custom Bot (user token)'`
label). It hasn't — the fork only **relabelled** upstream's pre-existing `authMethod:
oauth|bot_token` pair. Upstream #5323 layers a *credential*-level `slack-custom-bot`
service-account on top (`customBotCredential` subblock, `botCredential` param, `dependsOn` list
extensions) and exports `SlackV2Block` (`preview: true`, hidden until revealed via block-visibility
AppConfig / `PREVIEW_BLOCKS`). Both sides compose: take upstream's additions, keep the fork's
operations and its own labels. `SlackV2Block` spreads `SlackBlock.subBlocks`, so it inherits the
fork's extra operations for free.

Note `registry-maps.ts` imports `SlackV2Block` from `@/blocks/blocks/slack` — if a child ever
resolves `slack.ts` `--ours`, that import breaks the build. Union is mandatory here.

#### 5. Fork's org-scoped custom OAuth apps vs upstream's service accounts — complementary

The fork owns `apps/sim/lib/oauth/custom-apps.ts`, `resolveCustomOAuthAppConfig`,
`getProviderAuthConfig(provider, alias)`, `organizationId` plumbing through
`app/api/auth/oauth/utils.ts`, and HubSpot shared-tenant alias lookup via `accountTokens`.
Upstream adds `lib/credentials/service-account-secret.ts`, `GOOGLE_SERVICE_ACCOUNT_PROVIDER_ID`,
`SLACK_CUSTOM_BOT_PROVIDER_ID`, and rewrites `app/api/credentials/route.ts` (+49/−68). Different
mechanisms at different layers — union, with the fork's org/alias resolution preserved verbatim.
`app/api/credentials/route.ts` is the sharpest edge: upstream rewrote it while the fork only added
8 lines, so upstream's shape should win with the fork's 8 lines re-applied.

#### 6. `apps/docs` is not deployed by this fork

`docker-compose.p2prod.yml` ships only `simstudio`, `realtime`, `migrations`, `db`. The fork's
edits to `apps/docs` are three narrow things: `<link>`-based font loading (avoids a next/font
Turbopack resolution failure at build), `appleWebApp.title: 'P2 Agents Docs'`, and ~317 added
integration icons in `apps/docs/components/icons.tsx`. Upstream's docs changes (new
`components/footer/footer.tsx`, `sim-logo.tsx`, OG template, favicons) are Sim-branded but land on
a surface the fork does not serve, and the fork's docs app was already Sim-branded. Take upstream,
preserve those three fork edits. Not a question.

### Decided without asking (mechanical)

- **Model catalog** — the fork keeps every upstream provider and only comments out individual
  broken/deprecated models (`35c235d41 commented non working models`, `fc4ef655f commented
  deprecated models`). Precedent is unambiguous: take upstream's `nvidia` / `zai` providers, the new
  Groq/Cerebras/GLM entries and the catalog corrections; **never re-enable a model the fork
  commented out**, even when upstream edits that entry. Keep `azure-anthropic` and the fork's
  pricing coverage.
- **TikTok** — additive everywhere (block, 9 triggers, tools, `OAuthProvider`/`OAuthService`
  unions, `auth.ts` provider block, `TIKTOK_CLIENT_*` env, `webhook_tiktok_credential_id_idx`).
  Union; no fork surface collides.
- **Icypeas** — upstream removed it only from the enrichment **cascades**
  (`enrichments/work-email`, `enrichments/email-verification`); the `icypeas` tool/block/BYOK
  entries stay. The fork touches none of those files. Clean.
- **HubSpot CSP hosts** — carried by Q1's answer (drop with the loader, or keep with it).
- **`bun.lock` / `package.json`** — harness lockfile bootstrap, per policy. Agents never hand-edit.

### Open decisions

Exactly one — **Q1**, the HubSpot tracker (see `open-questions.md`). Everything else in this batch
resolves from merge policy, the fork's own precedent, or verified code behaviour.

## Parent plan

### Self-resolutions

- **SR1 — keep Arena favicons and app icon; never ship upstream's new Sim wordmark marks** (`ours`): apps/sim/public/icon.svg — Fork rebranded 6 of these assets (a7b189033 'logo chnages, agentIocn to vimiIcon'), but favicon-96x96.png / favicon.svg / web-app-manifest-*.png were never rebranded, so simstudioai/sim#5587 would auto-merge a NEW Sim wordmark into the Arena white-label with no conflict to catch it. Apply as a directive-level checkoutOurs so it covers unconflicted files too. (simstudioai/sim#5587 / FBI 2026-08-06 / merge-policy forkFirst (branding))
- **SR2 — take upstream's new landing and logo art (enterprise hero background, team avatars, 426-240 reverse logo)** (`theirs`): apps/sim/public/logo/426-240/reverse/small.png — Assets required by the enterprise page redesign; the fork never branded them, so taking upstream is status quo and #5535 renders correctly. (simstudioai/sim#5535 / simstudioai/sim#5587)
- **SR3 — take upstream's landing structure but preserve every Arena string** (`union`): apps/sim/app/(landing)/components/footer/footer.tsx, apps/sim/app/(landing)/components/hero/hero.tsx — Recurring fork rule confirmed in both files: SimWordmark -> ArenaWordmark, 'Sim is your AI workspace' -> 'Arena is the AI workspace', aria-label 'Sim home' -> 'Arena home', sr-only blurb says Arena. Upstream #5585 (sr-only logos heading containment) and #5582 (Share chip) are structural and must be taken. (simstudioai/sim#5585 / simstudioai/sim#5582 / fork 9abf83057, eb2af15f7)
- **SR4 — DB migrations: APPEND upstream's two migrations at the tail (0262/0263); do NOT renumber the fork's 0258-0261** (`mustEdit`): packages/db/migrations/0258_gigantic_lady_mastermind.sql, packages/db/migrations/0259_slack_native_routing.sql, packages/db/migrations/meta/_journal.json, packages/db/migrations/meta/0258_snapshot.json, packages/db/migrations/meta/0259_snapshot.json — drizzle-orm/pg-core/dialect.js:62 applies a migration only when Number(lastDbMigration.created_at) < migration.folderMillis. Upstream's 0258/0259 have when=1783620533559/1783722352108, which are OLDER than the fork's already-applied 0261_local_copilot_user_memory (when=1784346920598). Renumbering the fork's side (the usual fix) would make upstream's migrations be skipped forever on every already-migrated database, so webhook.routing_key would never exist and #5323's native Slack routing would fail at runtime. packages/db/scripts/migrate.ts uses stock migrate(), so there is no fork-side override. Appending instead is safe in both directions: fresh DBs run fork 0258-0261 then upstream 0262-0263, and upstream's SQL only touches the long-existing `webhook` table while the fork's 0258-0261 touch chat-thread / org-OAuth-app / local-copilot tables (no interdependency, verified by reading both SQL sets). (simstudioai/sim#5323 / drizzle-orm/pg-core/dialect.js:62 / packages/db/migrations/meta/_journal.json)
- **SR5 — union packages/db/schema.ts** (`union`): packages/db/schema.ts — Upstream adds webhook.path nullable + webhook.routingKey + two partial indexes (+34/-7). Fork added 913 lines (organization OAuth apps, local copilot, deployed-chat thread metadata). Disjoint; keep both. (merge-policy unionPaths / simstudioai/sim#5323 / simstudioai/sim#5504)
- **SR6 — union all registries, type unions, icon maps and the integrations catalog** (`union`): apps/sim/tools/registry.ts, apps/sim/blocks/registry-maps.ts, apps/sim/blocks/types.ts, apps/sim/tools/types.ts, apps/sim/providers/types.ts, apps/sim/providers/registry.ts, apps/sim/components/icons.tsx, apps/sim/lib/integrations/integrations.json, apps/sim/lib/oauth/types.ts — All four upstream additions are strictly additive: slack_v2 + tiktok in BLOCK_REGISTRY / BLOCK_META_REGISTRY, nvidia + zai in ProviderId and providerRegistry, zai + context_dev in BYOKProviderId, credentialKind?: 'custom-bot' on SubBlockConfig, tiktok in OAuthProvider/OAuthService. Fork additions are equally additive (Arena/Unipile/Facebook/Presentation entries, unipile_linkedin, zoom-admin, zoom-client, facebook-ads, ~330 icons). Never drop an upstream export that an in-tree consumer imports. (merge-policy unionPaths / simstudioai/sim#5323 / #5504 / #5560 / #5576)
- **SR7 — model catalog union; never re-enable a model the fork commented out** (`union`): apps/sim/providers/models.ts, apps/sim/providers/models.test.ts, apps/sim/providers/utils.ts, apps/sim/providers/utils.test.ts, apps/sim/providers/attachments.ts, apps/sim/providers/anthropic/core.ts — Fork precedent (35c235d41 'commented non working models', fc4ef655f 'commented deprecated models') is to keep every upstream provider and disable individual model entries by commenting them out, plus add the fork-only azure-anthropic provider and Phase-3/5 pricing coverage. Take upstream's nvidia + zai providers, the new Groq/Cerebras/GLM entries, the catalog-data corrections and the Gemini thinking-config wire format; keep every fork comment-out and azure-anthropic intact. (merge-policy unionPaths / simstudioai/sim#5559 / #5560 / #5561 / #5569 / #5584)
- **SR8 — Slack: union v1 and take SlackV2Block; resolving slack.ts --ours would break the build** (`union`): apps/sim/blocks/blocks/slack.ts, apps/sim/blocks/blocks.test.ts — The fork did not build a competing custom-bot feature — it only relabelled upstream's pre-existing authMethod oauth|bot_token pair ('Sim Bot (bot token)' / 'Custom Bot (user token)') and added operations (get_user_channels, search_all, date filters, pagination, thread controls). Upstream #5323 layers a credential-level slack-custom-bot service account on top (customBotCredential subblock, botCredential param, dependsOn extensions) and exports SlackV2Block (preview: true, hidden until revealed via block-visibility AppConfig or PREVIEW_BLOCKS). registry-maps.ts imports { SlackBlock, SlackBlockMeta, SlackV2Block } from '@/blocks/blocks/slack', so dropping upstream's slack.ts changes breaks compilation. SlackV2Block spreads SlackBlock.subBlocks, so it inherits the fork's operations automatically. Keep the fork's own label strings. (simstudioai/sim#5323 / apps/sim/blocks/registry-maps.ts:275)
- **SR9 — OAuth / credentials union; the fork's org-scoped custom OAuth apps and HubSpot alias resolution are authoritative** (`union`): apps/sim/lib/oauth/oauth.ts, apps/sim/lib/oauth/utils.ts, apps/sim/app/api/auth/oauth/utils.ts, apps/sim/app/api/auth/oauth/token/route.ts, apps/sim/app/api/credentials/route.ts, apps/sim/lib/auth/auth.ts, apps/sim/lib/api-key/byok.ts, apps/sim/lib/api/contracts/byok-keys.ts — Two complementary mechanisms at different layers. Fork owns lib/oauth/custom-apps.ts, resolveCustomOAuthAppConfig, getProviderAuthConfig(provider, alias), organizationId plumbing via workspace.organizationId, and HubSpot shared-tenant alias lookup through accountTokens — all must survive verbatim. Upstream adds lib/credentials/service-account-secret.ts, GOOGLE_SERVICE_ACCOUNT_PROVIDER_ID, SLACK_CUSTOM_BOT_PROVIDER_ID, the tiktok generic-oauth provider block in auth.ts (purely additive, +71/-0), and rewrites app/api/credentials/route.ts (+49/-68). In credentials/route.ts upstream's shape wins and the fork's 8 added lines are re-applied on top. (merge-policy manualReview (lib/auth/) / simstudioai/sim#5323 / fork 0259_organization_oauth_apps)
- **SR10 — env, hosted-key rotation, CSP, proxy and next.config union** (`union`): apps/sim/lib/core/config/env.ts, apps/sim/lib/core/config/api-keys.ts, apps/sim/.env.example, apps/sim/next.config.ts, apps/sim/proxy.ts, apps/sim/lib/core/security/csp.ts — All upstream deltas are additive: ZAI_API_KEY_1..3, TIKTOK_CLIENT_ID/SECRET, SLACK_SIGNING_SECRET, the zai branch in getRotatingApiKey, and Context.dev in the hosted rotation pool. Fork's ~100 added env entries and 65 CSP additions stay. The HubSpot CSP hosts in csp.ts are the one exception — carried by Q1. (simstudioai/sim#5560 / #5569 / #5576 / #5323 / #5504)
- **SR11 — apps/docs: upstream-first, preserve exactly three fork edits** (`mustEdit`): apps/docs/app/layout.tsx, apps/docs/app/[lang]/layout.tsx, apps/docs/app/global.css, apps/docs/components/icons.tsx, apps/docs/components/workflow-preview/format-references.tsx — docker-compose.p2prod.yml ships only simstudio / realtime / migrations / db — the fork does not serve apps/docs, and its docs app is already Sim-branded apart from the appleWebApp title. Take upstream's #5581/#5587 docs work (footer, sim-logo, OG template, favicons) and re-apply the fork's three edits: the FONT_LINKS <link> block in app/[lang]/layout.tsx (works around a next/font Turbopack resolution failure at build), appleWebApp.title 'P2 Agents Docs' in app/layout.tsx, and the ~317 fork integration icons in components/icons.tsx. (simstudioai/sim#5581 / simstudioai/sim#5587 / docker-compose.p2prod.yml)
- **SR12 — executor / workflow store / collaborative hook union for server-side edge validation** (`union`): apps/sim/executor/constants.ts, apps/sim/executor/handlers/workflow/workflow-handler.ts, apps/sim/stores/workflows/workflow/store.ts, apps/sim/stores/workflows/workflow/store.test.ts, apps/sim/hooks/use-collaborative-workflow.ts, apps/sim/lib/workflows/input-format.ts, apps/sim/lib/workflows/subblocks/visibility.ts — simstudioai/sim#5571 moves edge/block validation server-side (packages/workflow-types +251, untouched by the fork so it merges clean). The shared files carry modest fork deltas; take upstream's validation logic and keep fork behaviour on top. Run the store and executor test suites after resolution. (simstudioai/sim#5571)
- **SR13 — workspace UI union (editor, sub-block, credential selector, headers, BYOK settings)** (`union`): apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/editor.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/sub-block.tsx, apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/credential-selector/credential-selector.tsx, apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/workspace-header/workspace-header.tsx, apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/workflow-list/components/workflow-item/workflow-item.tsx, apps/sim/app/workspace/[workspaceId]/integrations/[block]/integration-block-detail.tsx, apps/sim/app/workspace/[workspaceId]/settings/components/byok/byok.tsx — Upstream deltas are small and targeted: #5563 sidebar rename-input selection fix, #5566/#5570 MCP caret + object-param JSON editor, #5323 custom-bot credential kind in credential-selector, #5576 context_dev BYOK row. Fork deltas are large but additive (Arena integrations, mothership admin surfaces). Take both; keep the fork's Arena-specific UI. (simstudioai/sim#5563 / #5566 / #5570 / #5323 / #5576)
- **SR14 — no upstream change deliberately skipped beyond whatever Q1 decides** (`theirs`): _no paths_ — TikTok, Icypeas cascade removal, custom-block hardening, rich-markdown-editor fixes, docker/pii.Dockerfile CUDA torch, enterprise page redesign and skills-lock/scripts changes all land unmodified — none collide with a fork surface. Record the final skipped set in skipped.md after Q1 is answered. (FBI 2026-08-06)

### Child areas

- **db-migrations** `packages/db/` (`union`): area-level (files assigned after merge) — Highest-risk cluster. schema.ts is a plain union (SR5). migrations/ follows SR4 exactly: keep the fork's 0258-0261 and their journal entries byte-identical; rename upstream 0258_gigantic_lady_mastermind.sql -> 0262_..., 0259_slack_native_routing.sql -> 0263_...; append journal entries at idx 262/263 with `when` values strictly greater than 1784346920598; rename upstream meta/0258_snapshot.json -> meta/0262_snapshot.json and meta/0259_snapshot.json -> meta/0263_snapshot.json, and reconcile the tail snapshot against the merged schema.ts so future `drizzle-kit generate` diffs are correct. Do NOT regenerate the SQL bodies — both files carry hand-written `COMMIT;` + `CREATE INDEX CONCURRENTLY` blocks that drizzle-kit would destroy. Read .agents/skills/db-migrate/SKILL.md. Verify with `bun run check:migrations`.
- **registries-and-types** `apps/sim/` (`union`): area-level (files assigned after merge) — SR6. tools/registry.ts, blocks/registry-maps.ts, blocks/types.ts, tools/types.ts, providers/types.ts, providers/registry.ts, components/icons.tsx, lib/integrations/integrations.json, lib/integrations/icon-mapping.ts, lib/oauth/types.ts. Alphabetical ordering matters in registry-maps.ts. Keep the fork's integrations.json oauthServiceId 'zoom-client' override for Zoom.
- **providers-models** `apps/sim/providers/` (`union`): area-level (files assigned after merge) — SR7. Largest single-file union (fork +1660/-1499 vs upstream +397/-4 in models.ts). Hard rule: a model entry the fork has commented out stays commented out even when upstream edits it. Keep the fork's azure-anthropic provider block and pricing fields. Run apps/sim/providers/models.test.ts and utils.test.ts after resolving.
- **oauth-credentials-slack** `apps/sim/lib/oauth/` (`union`): area-level (files assigned after merge) — SR8 + SR9. Spans lib/oauth/, app/api/auth/oauth/, app/api/credentials/, lib/credentials/, lib/auth/auth.ts, blocks/blocks/slack.ts, blocks/blocks.test.ts. Preserve lib/oauth/custom-apps.ts, resolveCustomOAuthAppConfig, the alias parameter on getProviderAuthConfig, organizationId plumbing, and the accountTokens HubSpot alias branch verbatim. slack.ts MUST keep exporting SlackV2Block or registry-maps.ts fails to compile.
- **env-config-csp** `apps/sim/lib/core/` (`union`): area-level (files assigned after merge) — SR10 + Q1. lib/core/config/env.ts, lib/core/config/api-keys.ts, lib/core/security/csp.ts, apps/sim/.env.example, apps/sim/next.config.ts, apps/sim/proxy.ts. The HubSpot CSP hosts in csp.ts (hs-scripts / hs-analytics / hscollectedforms / hs-banner) are governed by Q1's directive, not by this cluster's default union.
- **landing-branding** `apps/sim/app/(landing)/` (`union`): area-level (files assigned after merge) — SR1 + SR2 + SR3 + Q1. Every user-facing 'Sim' string in landing chrome becomes 'Arena' (see .claude/rules/constitution.md and the fork's footer.tsx / hero.tsx). Binary assets under apps/sim/public/favicon/ and apps/sim/public/icon.svg are checkoutOurs; apps/sim/public/landing/ and apps/sim/public/logo/ take upstream. The HubSpot loader in (landing)/layout.tsx and (landing)/hubspot-page-view-tracker.tsx are governed by Q1.
- **workspace-ui** `apps/sim/app/workspace/` (`union`): area-level (files assigned after merge) — SR13. editor.tsx, sub-block.tsx, credential-selector.tsx, workspace-header.tsx, workflow-item.tsx, integration-block-detail.tsx, settings/components/byok/byok.tsx, plus lib/api-key/byok.ts and lib/api/contracts/byok-keys.ts. Follow .claude/rules/sim-styling.md and the EMCN chip rules for any touched markup.
- **executor-workflow-store** `apps/sim/executor/` (`union`): area-level (files assigned after merge) — SR12. executor/constants.ts, executor/handlers/workflow/workflow-handler.ts, stores/workflows/workflow/store.ts + store.test.ts, hooks/use-collaborative-workflow.ts, lib/workflows/input-format.ts, lib/workflows/subblocks/visibility.ts. packages/workflow-types/src/workflow.ts (+251) has no fork delta and merges clean, but the shared files must line up with its new validation contract.
- **docs-app** `apps/docs/` (`theirs`): area-level (files assigned after merge) — SR11. Upstream-first. Re-apply exactly three fork edits after taking upstream: the FONT_LINKS <link> block in app/[lang]/layout.tsx, appleWebApp.title 'P2 Agents Docs' in app/layout.tsx, and the fork's added integration icons in components/icons.tsx.

Phase A only — no merge performed, no conflicts exist yet, so childClusters are area-level and `files` is intentionally empty. Child model is gpt-5.6-luna at max effort for every cluster. merge-policy.json was updated this run with the unionPaths / forkFirst / manualReview additions and a migrations.strategy entry recording the drizzle created_at gate; extensibility-notes.md carries the standing append-upstream-at-tail rule. Recommended cluster order if the harness serializes: db-migrations, registries-and-types, oauth-credentials-slack, providers-models, executor-workflow-store, workspace-ui, env-config-csp, landing-branding, docs-app.


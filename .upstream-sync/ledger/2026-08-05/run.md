# Upstream Sync Run — 2026-08-05

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `6c3d11b2`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 23
- **Merge tip:** active-upstream-sha 6c3d11b2 (`6c3d11b2`; full upstream HEAD `404bc6a3`)

## Grill analysis

### Scope of this slice

Release tip **v0.7.29** (`6c3d11b2`), 23 commits since merge-base `e2fecc86`. No release body on GitHub, so the FBI report is the authoritative change list.

Measured conflict surface (not guessed):

- Upstream touched **352 files**; the fork touched **1585 files** since the same baseline.
- Intersection = **63 files**. Everything else merges without a decision.

### Upstream FBIs in this batch

| Theme | Upstream PRs | Fork impact |
|---|---|---|
| Model catalog + new providers (NVIDIA NIM, Z.ai/GLM, Groq, Cerebras), Gemini thinking-config wire format, max-tokens fix | #5559, #5560, #5561, #5569, #5584 | `providers/**` union (fork added its own providers/attachment handling) |
| **TikTok integration** (block, 7 tools, 8 triggers, webhook ingress) | #5504 | New files only + registry union. Fork never touched `triggers/`, `lib/webhooks/providers/tiktok*` |
| **Slack: reusable custom bot credentials, `slack_v2` preview block, redesigned native trigger** | #5323 | Highest-risk area — collides with the fork's org-level custom OAuth apps and its 834-line Slack block extension |
| Server-side workflow edge/block validation | #5571 | `executor/`, `stores/workflows/`, `use-collaborative-workflow.ts` union |
| Custom blocks: hardened delete + per-input `required` | #5575 | `schema.ts` `customBlock.inputs` type widening; `blocks/types.ts` union |
| MCP fixes (caret alignment, object params → JSON editor) | #5566, #5570 | Editor/sub-block union |
| Rich markdown editor image dupe-upload + link colour | #5573 | No fork overlap |
| Context.dev hosted key rotation; Icypeas **enrichment providers** removed | #5576, #5572 | `byok`/`api-keys` union. Verified: Icypeas **block and tools stay registered upstream** (3 refs at `6c3d11b2`) — no fork fallout from the enrichment removal |
| Landing: enterprise page redesign, Share chip, sr-only logo scrollbar fix, HubSpot tracking script | #5535, #5582, #5585, #5565 | See "HubSpot" below |
| Branding: Sim wordmark favicon/OG, docs footer parity, footer peel | #5587, #5581 | Collides with fork's Arena brand assets |
| PII GLiNER CUDA torch on amd64 | #5552 | No fork overlap |

### Fork-owned paths at risk

None of the `forkFirst` prefixes in `merge-policy.json` are touched by upstream in this range — the Arena/P2/Unipile/Facebook/Presentation/Figma/mothership surfaces are not in the 63-file intersection. The risk in this slice is concentrated in **shared** files both sides extended:

| Shared file | Upstream Δ | Fork Δ | Shape |
|---|---|---|---|
| `apps/sim/providers/models.ts` | 401 | 3159 (14 hunks) | additive both sides |
| `apps/sim/blocks/blocks/slack.ts` | 114 | 834 | additive both sides, overlapping regions |
| `apps/sim/lib/oauth/oauth.ts` | 51 | 336 | same map + same function |
| `apps/sim/app/api/auth/oauth/utils.ts` | 117 | 247 | same functions |
| `apps/sim/lib/auth/auth.ts` | 71 | 312 | additive both sides |
| `apps/sim/components/icons.tsx` | 57 | 362 | pure append both sides |
| `apps/sim/tools/registry.ts` | 22 | 281 | pure append both sides |
| `apps/sim/proxy.ts` / `csp.ts` / `env.ts` | 11 / 10 / 6 | 129 / 69 / 112 | additive both sides |

### Decisions resolved from evidence (no human needed)

**1. DB migration index collision — renumber upstream, not the fork.**
Both sides added `0258` and `0259`. Fork: `0258_deployed_chat_thread_metadata` … `0261_local_copilot_user_memory`. Upstream: `0258_gigantic_lady_mastermind` (TikTok credential-id partial index) and `0259_slack_native_routing` (`webhook.path` DROP NOT NULL, `routing_key`, partial index).

The fork's `0258`–`0261` are **already applied in fork environments**; upstream's two are applied nowhere in the fork. So renumber the *unapplied* side: upstream `0258` → `0262`, upstream `0259` → `0263`, keep `meta/_journal.json` + `meta/0258_snapshot.json` + `meta/0259_snapshot.json` as **ours**, and append two journal entries. This keeps the deployed journal prefix byte-identical. The two upstream migrations are independent of every fork table (`webhook`, `custom_block` only), so ordering them after the fork's is safe. Both files already carry `COMMIT;` breakpoints + `CREATE INDEX CONCURRENTLY`, and `DROP NOT NULL` is a relaxing change that `scripts/check-migrations-safety.ts` does not gate — copy the SQL verbatim.

**Do not run `drizzle-kit generate` to rebuild snapshots.** The fork already has a pre-existing snapshot gap: `_journal.json` records `idx: 261` but `meta/` stops at `0260_snapshot.json`. Regenerating would diff against `0260` and re-emit `0261`'s changes as a spurious migration. Hand-author instead; the gap is logged as a fork follow-up.

**2. Slack #5323 — take it in full; the blast radius is smaller than it looks.**
Verified the fork did **not** touch `apps/sim/triggers/slack/**`, `apps/sim/lib/webhooks/providers/slack.ts`, or `apps/sim/app/api/webhooks/slack/**` (that path does not exist on the fork). Upstream's native OAuth trigger, `slack-dispatch.ts`, and the custom-bot webhook route all land as clean adds. `SlackV2Block` is appended inside `blocks/blocks/slack.ts` (there is no `slack_v2.ts`) and is preview-gated, so it is hidden until revealed. The only genuine conflict is `blocks/blocks/slack.ts` itself → union.

Upstream's `slack-custom-bot` is a `service_account`-type credential (`SLACK_CUSTOM_BOT_PROVIDER_ID`), which is **orthogonal** to the fork's org-level custom OAuth apps (`lib/oauth/custom-apps.ts`, `custom-app-config.ts`, migrations `0259`/`0260`). Both can coexist: keep the fork's custom-app resolution inside `getProviderAuthConfig`, add upstream's Slack branch and its new `ProviderAuthConfig` field.

**3. Brand assets — fork-first, and now encoded in policy.**
The fork replaced `apps/sim/public/icon.svg` (green Arena mark) and the favicon PNGs; #5587 replaces them with the Sim wordmark. Added `apps/sim/public/favicon/`, `apps/sim/public/icon.svg`, `apps/sim/public/logo/` to `forkFirst` so binary conflicts auto-resolve to ours from now on.

Note the asymmetry, which is **not** a regression: `favicon-96x96.png`, `favicon.svg`, `web-app-manifest-*.png` and `logo/426-240/reverse/small.png` were never rebranded by the fork, so they already ship Sim art today. Upstream's update to those files changes nothing about fork intent and merges cleanly. Full favicon-set rebranding is a fork task, not a merge decision.

Landing copy: fork renamed `SimWordmark` → `ArenaWordmark` in `footer.tsx` and rewrote the hero headline/sr-only text. Upstream only adds an `Enterprise` entry to `PRODUCT_LINKS` — union, keep `ArenaWordmark`. The new `/enterprise` page arrives Sim-branded, consistent with every other landing route the fork already ships un-rebranded (`/models`, `/integrations`, blog).

**4. HubSpot marketing tracker (#5565) — SKIPPED.**
Upstream's `(landing)/layout.tsx` loads `https://js-na2.hs-scripts.com/246720681.js` (Sim's HubSpot portal) gated by `isHosted`. The fork **redefined `isHosted`** (`apps/sim/lib/core/config/env-flags.ts`) to include `agent.thearena.ai`, `dev-/test-/sandbox-agent.thearena.ai` and `localhost:3000`. So unlike a self-hosted deployment, this loader **would** fire on the fork's production landing site.

The HubSpot loader injects `hscollectedforms.js`, which scrapes form submissions — so this is not just pageview telemetry, it is lead/PII capture into a third party's CRM. That is not something to opt the fork into silently, and skipping is a one-line reversal. Resolution: keep upstream's `csp.ts` host allowances (permit-only, and keeping them avoids re-conflicting this file every sync), but drop the loader wiring and the tracker component. Logged in `skipped.md` with the re-enable recipe.

**Pre-existing issue found while checking this** (fork follow-up, not a merge blocker): `apps/sim/app/layout.tsx` on the fork still carries **upstream's** analytics IDs verbatim — `GTM-T7PHSRX5` and `G-DR7YBE70VS`, byte-identical to `6c3d11b2` — under the same `isHosted` gate. Fork traffic on `*.thearena.ai` has been reporting into Sim's Google Tag Manager / GA properties. Swap these for Position2/Arena-owned IDs.

**5. `webhook.path` becomes nullable** — a typing change with fork fallout. `apps/sim/lib/webhooks/utils.server.ts` and `processor.ts` use `eq(webhook.path, …)` and select `path` into `string` positions. Upstream fixed its own call sites; fork-only webhook code may need explicit null handling. This is a build-gate item, not a conflict — `bun run build` is blocking and will surface it.

**6. `/landing-preview` deletion is coherent.** #5565 deletes `apps/sim/app/landing-preview/**` *and* `SandboxWorkspacePermissionsProvider` from `app/workspace/[workspaceId]/providers/workspace-permissions-provider.tsx`. The fork carries the four `landing-preview` files unmodified, so the delete applies cleanly. The pairing matters: if the deletions are dropped but the provider removal is taken, `landing-preview/readme-tour-capture/[workspaceId]/page.tsx` breaks the build on a missing import. Take both halves together.

### Open decisions

None. Every call above is grounded in the diff, `merge-policy.json`, or the migration lint — no fork-vs-upstream product ambiguity was left unresolved, so the merge is not gated on a human round-trip.

## Parent plan

### Self-resolutions

- **SR1 — renumber upstream migrations to 0262/0263, keep fork journal and colliding snapshots** (`mustEdit`): packages/db/migrations/0258_gigantic_lady_mastermind.sql, packages/db/migrations/0259_slack_native_routing.sql, packages/db/migrations/meta/0258_snapshot.json, packages/db/migrations/meta/0259_snapshot.json, packages/db/migrations/meta/_journal.json — Both sides added 0258 and 0259. Fork 0258-0261 are already applied in fork environments; upstream's two are applied nowhere in the fork, so renumber the unapplied side. Work order: (1) checkout --ours meta/_journal.json, meta/0258_snapshot.json, meta/0259_snapshot.json; (2) copy upstream 0258_gigantic_lady_mastermind.sql verbatim to 0262_tiktok_credential_id_idx.sql and upstream 0259_slack_native_routing.sql verbatim to 0263_slack_native_routing.sql, then remove the two colliding upstream filenames; (3) append journal entries idx 262 and 263 (version "7", tags matching the new filenames, monotonic `when` above the fork's 1784346920598). Both SQL files already carry COMMIT; breakpoints + CREATE INDEX CONCURRENTLY, and ALTER COLUMN path DROP NOT NULL is a relaxing change that check-migrations-safety.ts does not gate — do not rewrite the SQL. DO NOT run drizzle-kit generate: the fork has a pre-existing snapshot gap (journal records idx 261 but meta/ stops at 0260_snapshot.json), so a regenerate would diff against 0260 and re-emit 0261 as a spurious migration. (FBI #5504 / #5323 / db-migrate skill / merge-policy manualReview packages/db/migrations/)
- **SR2 — union packages/db/schema.ts** (`union`): packages/db/schema.ts — Keep fork tables (deployed chat thread metadata, organization OAuth apps + allowed workspaces, local copilot user memory) and take upstream's webhook.routingKey, nullable webhook.path, webhookCredentialIdExpression(), the two new partial indexes, and customBlock.inputs `required?`. Non-overlapping regions of the same file. Follow-up for the build gate: webhook.path is now `string | null`, so fork-only readers in apps/sim/lib/webhooks/ (utils.server.ts, processor.ts) may need explicit null handling. (merge-policy unionPaths packages/db/schema.ts / FBI #5323 #5504 #5575)
- **SR3 — take Slack #5323 in full; union slack.ts** (`union`): apps/sim/blocks/blocks/slack.ts — Verified the fork never touched apps/sim/triggers/slack/**, lib/webhooks/providers/slack.ts, or app/api/webhooks/slack/** (absent on the fork) — the native OAuth trigger, slack-dispatch, and custom-bot webhook route land as clean adds. SlackV2Block is appended inside blocks/blocks/slack.ts (there is no slack_v2.ts) and is preview-gated, so it stays hidden until revealed. Union slack.ts: keep the fork's 834 lines of added Slack operations/subBlocks, take upstream's SubBlockConfig import, its dependsOn/credential edits, and the appended SlackV2Block + triggers export. (simstudioai/sim#5323)
- **SR4 — keep fork custom-OAuth-app plumbing, add upstream slack-custom-bot and google-service-account** (`union`): apps/sim/lib/oauth/oauth.ts, apps/sim/lib/oauth/types.ts, apps/sim/lib/oauth/utils.ts, apps/sim/app/api/auth/oauth/utils.ts, apps/sim/app/api/auth/oauth/token/route.ts, apps/sim/app/api/credentials/route.ts — Upstream's SLACK_CUSTOM_BOT_PROVIDER_ID is a service_account-type credential, orthogonal to the fork's org-level custom OAuth apps (lib/oauth/custom-apps.ts, custom-app-config.ts, migrations 0259/0260). Both sides edit OAUTH_PROVIDERS, the ProviderAuthConfig interface, getProviderAuthConfig(), and refreshAccessTokenIfNeeded(). Keep every fork symbol (zoom-admin, zoom-client, facebook-ads, unipile_linkedin, custom-app resolution, Microsoft changes) and add upstream's tiktok provider, Slack custom-bot branch, Google service-account token exchange, and the new ProviderAuthConfig field. Never drop an upstream export — in-tree consumers import them. (merge-policy unionPaths apps/sim/lib/oauth/types.ts / simstudioai/sim#5323)
- **SR5 — fork brand assets win on conflict** (`ours`): apps/sim/public/icon.svg — The fork deliberately replaced icon.svg (green Arena mark) and the favicon PNGs; #5587 swaps them for the Sim wordmark. Added these prefixes to merge-policy forkFirst this run so binary conflicts auto-resolve to ours in future syncs. Files the fork never rebranded (favicon-96x96.png, favicon.svg, web-app-manifest-*.png, logo/426-240/reverse/small.png) already ship Sim art today, so upstream's update to those merges cleanly and is not a regression — completing the favicon rebrand is a fork task, not a merge decision. (simstudioai/sim#5587 / merge-policy forkFirst (added this run))
- **SR6 — keep ArenaWordmark and fork hero copy, take upstream's Enterprise footer link** (`union`): apps/sim/app/(landing)/components/footer/footer.tsx, apps/sim/app/(landing)/components/hero/hero.tsx — Fork renamed the import/usage to ArenaWordmark and rewrote the hero headline + sr-only copy; upstream only prepends { label: 'Enterprise', href: '/enterprise' } to PRODUCT_LINKS and adjusts hero layout. Different regions — union, keeping every fork branding string. The new /enterprise page arrives Sim-branded, consistent with every other landing route the fork already ships un-rebranded (/models, /integrations, blog); rebranding it is a fork follow-up. (simstudioai/sim#5535 #5582 #5585)
- **SR7 — drop the HubSpot marketing loader and pageview tracker; keep the CSP host allowances** (`mustEdit`): apps/sim/app/(landing)/layout.tsx, apps/sim/app/(landing)/hubspot-page-view-tracker.tsx, apps/sim/lib/core/security/csp.ts — Upstream loads https://js-na2.hs-scripts.com/246720681.js (Sim's HubSpot portal) gated by isHosted. The fork redefined isHosted in lib/core/config/env-flags.ts to include agent.thearena.ai, dev-/test-/sandbox-agent.thearena.ai and localhost:3000, so the loader WOULD fire on the fork's production landing site. The loader injects hscollectedforms.js, which scrapes form submissions — lead/PII capture into a third party's CRM, not just pageview telemetry. Work order: strip the isHosted HubSpot block (Script + Suspense + HubspotPageViewTracker + HUBSPOT_SCRIPT_SRC + the Suspense/Script/isHosted imports it introduced) from (landing)/layout.tsx, and delete apps/sim/app/(landing)/hubspot-page-view-tracker.tsx. Keep upstream's csp.ts HubSpot hunks: they are permit-only, and keeping them stops this file re-conflicting every sync. Logged in skipped.md with the re-enable recipe (one Script tag + the fork's own portal ID). (simstudioai/sim#5565 / apps/sim/lib/core/config/env-flags.ts)
- **SR8 — append-only unions for registries, icons, integrations manifest, and providers** (`union`): apps/sim/tools/registry.ts, apps/sim/blocks/registry-maps.ts, apps/sim/components/icons.tsx, apps/sim/lib/integrations/integrations.json, apps/sim/blocks/types.ts, apps/sim/tools/types.ts, apps/sim/blocks/blocks.test.ts — Both sides only append. Take upstream's tiktok_* tool ids, TikTokBlock/TikTokBlockMeta, slack_v2: SlackV2Block, new icons, and the NVIDIA NIM / Z.ai (GLM) / Groq / Cerebras model + provider entries; keep every fork tool, block, icon, and provider. Verified no upstream removals to reconcile: context_dev tools (20 refs) and the Icypeas block/tools (3 refs) are still registered at 6c3d11b2 — #5572 only removed Icypeas enrichment providers, which the fork never modified. Keep BLOCK_REGISTRY / BLOCK_META_REGISTRY alphabetical per CLAUDE.md. (merge-policy unionPaths tools/registry.ts, blocks/registry-maps.ts, providers/models.ts / FBI #5504 #5559-#5561 #5569 #5572 #5576)
- **SR9 — take the /landing-preview deletion together with the SandboxWorkspacePermissionsProvider removal** (`theirs`): apps/sim/app/workspace/[workspaceId]/providers/workspace-permissions-provider.tsx — #5565 deletes apps/sim/app/landing-preview/** and removes SandboxWorkspacePermissionsProvider, its only consumer. The fork carries the four landing-preview files unmodified so the delete applies cleanly. The halves must move together: taking the provider removal while keeping landing-preview/readme-tour-capture/[workspaceId]/page.tsx breaks the build on a missing import. (simstudioai/sim#5565)
- **SR10 — union env flags, CSP, proxy, next.config, byok, and auth** (`union`): apps/sim/lib/core/config/env.ts, apps/sim/lib/core/config/api-keys.ts, apps/sim/next.config.ts, apps/sim/proxy.ts, apps/sim/.env.example, apps/sim/lib/api-key/byok.ts, apps/sim/lib/api/contracts/byok-keys.ts, apps/sim/lib/auth/auth.ts — Additive on both sides — upstream adds Context.dev to the hosted key rotation pool, HubSpot CSP hosts, and TikTok env keys; the fork has 112 lines of its own env schema, 69 of CSP hosts, 129 of proxy routing, and 312 in auth.ts. Keep every fork entry and add upstream's. auth.ts is in manualReview: read both sides' plugin/hook lists before writing. (merge-policy unionPaths env-flags.ts, manualReview apps/sim/lib/auth/ / FBI #5576 #5565 #5504)

### Child areas

- **db-schema-migrations** `packages/db/` (`union`): area-level (files assigned after merge) — Highest-care cluster. Apply SR1 verbatim (renumber upstream 0258->0262, 0259->0263; keep fork _journal.json + 0258/0259 snapshots; append two journal entries; do NOT run drizzle-kit generate — pre-existing snapshot gap at idx 261). Apply SR2 for schema.ts. Must end with `bun run check:migrations` passing. Area-level plan; real files are assigned in Phase B after merge.
- **oauth-credentials** `apps/sim/lib/oauth/` (`union`): area-level (files assigned after merge) — Also covers apps/sim/app/api/auth/oauth/ and apps/sim/app/api/credentials/. Apply SR4. Two independent custom-OAuth designs edit the same map, interface, and functions — read both full functions before resolving; never drop an upstream export. Test files (oauth.test.ts, utils.test.ts, microsoft.test.ts, credentials/route.test.ts) must keep fork cases and gain upstream's. Area-level plan; real files are assigned in Phase B after merge.
- **slack-registries-blocks** `apps/sim/blocks/` (`union`): area-level (files assigned after merge) — Also covers apps/sim/tools/, apps/sim/components/icons.tsx, apps/sim/lib/integrations/. Apply SR3 + SR8. slack.ts is the only non-trivial file: both sides edit overlapping regions. Keep BLOCK_REGISTRY/BLOCK_META_REGISTRY alphabetical. Area-level plan; real files are assigned in Phase B after merge.
- **providers-models** `apps/sim/providers/` (`union`): area-level (files assigned after merge) — models.ts (401 upstream vs 3159 fork, 14 fork hunks), registry.ts, types.ts, utils.ts, anthropic/core.ts, attachments.ts, plus models.test.ts / utils.test.ts. Take NVIDIA NIM, Z.ai/GLM, Groq and Cerebras entries, the Gemini thinking-config wire format fix, the max-tokens correction, and the restored Anthropic landing-chart models; keep every fork provider and the fork's attachment handling. Area-level plan; real files are assigned in Phase B after merge.
- **env-csp-proxy-byok** `apps/sim/lib/core/` (`union`): area-level (files assigned after merge) — Also covers apps/sim/proxy.ts, next.config.ts, .env.example, lib/api-key/byok.ts, lib/api/contracts/byok-keys.ts, and the byok settings component. Apply SR10; keep upstream's HubSpot CSP hosts per SR7 even though the loader is dropped. Area-level plan; real files are assigned in Phase B after merge.
- **workflow-editor-executor** `apps/sim/executor/` (`union`): area-level (files assigned after merge) — Also covers apps/sim/stores/workflows/, apps/sim/hooks/use-collaborative-workflow.ts, apps/sim/lib/workflows/, and the workspace editor UI (sub-block, credential-selector, editor, workflow-item, workspace-header, integration-block-detail). Upstream #5571 moves edge/block validation server-side; #5566/#5570 fix MCP caret alignment and object-param routing; #5575 adds per-input `required`. Keep the fork's collaborative-workflow and input-format changes. Area-level plan; real files are assigned in Phase B after merge.
- **branding-landing** `apps/sim/app/(landing)/` (`union`): area-level (files assigned after merge) — Also covers apps/sim/public/, apps/docs/, and apps/sim/lib/auth/auth.ts. Apply SR5 (ours on brand assets), SR6 (union landing copy), SR7 (mustEdit + delete for HubSpot), SR9 (take the landing-preview deletion), and the auth.ts half of SR10. Area-level plan; real files are assigned in Phase B after merge.

Phase A, release slice v0.7.29 (6c3d11b2), 23 commits. Measured surface: upstream touched 352 files, fork touched 1585 since merge-base e2fecc86, intersection 63 files. No forkFirst prefix in merge-policy.json is touched by upstream in this range. No open questions — every decision is grounded in the diff, merge-policy, or scripts/check-migrations-safety.ts. merge-policy.json was updated this run: forkFirst += apps/sim/public/favicon/, apps/sim/public/icon.svg, apps/sim/public/logo/; unionPaths += lib/oauth/oauth.ts, app/api/auth/oauth/utils.ts, providers/utils.ts, components/icons.tsx, blocks/blocks/slack.ts, lib/core/security/csp.ts, proxy.ts, lib/auth/auth.ts; manualReview += packages/db/migrations/meta/, apps/sim/app/(landing)/components/, apps/sim/lib/oauth/. Build is blocking — expect webhook.path nullability fallout in fork-only apps/sim/lib/webhooks/ code.


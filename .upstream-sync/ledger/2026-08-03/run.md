# Upstream Sync Run — 2026-08-03

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `13a9119d`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `e2fecc86` (merge-base)
- **Commits in sync range:** 480

## Grill analysis

_First run for this range — `grill-log.md` and `qa-history.jsonl` are empty, so no prior human answers apply. Draft PR is fork PR #677 (`arenadeveloper02/p2-sim`); note `gh` has no default repo set, so PR ops must pass `--repo arenadeveloper02/p2-sim` (a bare `gh pr view 677` resolves against `simstudioai/sim`)._

### Merge-conflict surface (read-only `git merge-tree`, base `e2fecc86`)

- **~230 conflicted files** (222 content + several modify/delete + add/add). Large but expected for 480 commits.
- **Fork-owned isolated integration paths held cleanly — zero conflicts:** `tools/arena/*`, `tools/unipile/*`, `blocks/blocks/{arena,unipile,facebook_ads,presentation,p2_docs}.ts`, `lib/hubspot/`, `lib/branding/`, `app/api/admin/mothership/`, `hooks/queries/mothership-admin.ts`. The path-prefix isolation strategy is working for these.
- Conflicts are concentrated in **shared code the fork also modified**: copilot/mothership, billing, oauth, files/uploads, providers/models, chat interfaces, landing, settings, executor handlers, logs.

### Upstream FBIs in this batch (highlights, by theme — full list in `fbi-report.md`)

- **Copilot rework — "mothership v0.8" (#5410)** plus a long tail of copilot/chat/streaming/rendering commits (#5660, #5828, #5830 soft-delete chats, #5671 thinking/tool streaming, #6087 highlight-to-chat, #5952/#6142 special-tag parsing, #6103/#6144 auto-model). **Highest-overlap area — see Open Decision 1.**
- **Integrations added (additive, isolated — take):** Buffer #5637, Flint #5641, ClickUp #5702/#5708, Rocketlane #5709, GitLab #5710/#5743, Instagram #5568/#6143, TikTok #5504/#5978, Kimi provider #5716, NVIDIA/Z.ai #5560, Logfire #6075, Zoho Desk #6157, Outlook calendar #6041, Gong #5632, Exa refresh #6074.
- **DB / schema feats (migrations):** generic folders engine #6037/#6025/#6045/#6051, tables select/multi-select #5873 / currency #6106 / saved views #5961 / v2 surface #6067, org session policies #5862, resource pinning #6014, role-keyed db clients #5583.
- **Registry/perf refactors:** block registry no module-scope read #6083; **tool-registry perf refactor #6138/#6152/#6153/#6155/#6156** (generated serializable tool metadata + registry-free client boundary).
- **Security hardening (take, shared infra):** better-auth 1.6.23 + trusted-proxy #5857, next 16.2.12 #6077, sharp/js-yaml #5848, otel CVE #6182, isolated-vm hardening #6116/#5935, MCP SSRF guard #5823, zip-bomb/YAML DoS guards #5756/#6166/#6176, span secret sanitization #6000/#18214158, secureFetch body bounds #6169, presigned upload authz #6175, realtime room access #6170/#5917.
- **New surfaces:** Desktop app #5998 (+ security #6065, CI tag hardening #6044/#6109) — see Open Decision 4. Realtime Files/Tables collaboration + Yjs #5991. Setup wizard #5911/#5964. Self-host settings plane #5990/#6028.

### Mechanically resolvable (RECORDED decisions — no human input needed)

These follow from `merge-policy.json`, the constitution, and the facts above:

1. **Fork-owned isolated integrations** (arena, unipile, facebook_ads, presentation, p2_docs, `lib/hubspot`, `lib/branding`) — fork-first; held with no conflict. No action.
2. **Landing pages, favicons/`public/icon.svg`, marketing/SEO copy** (conflicts in `app/(landing)/*`, `public/favicon/*`, `home-structured-data`, emails) → **fork-first**. Policy default is fork-first for non-infra, and `constitution.md` + `lib/branding/defaults.ts` (hard-coded Arena/Position2 brand: name, logos, `arenadeveloper@position2.com`, `help.thearena.ai`, blue palette) mean the fork intentionally carries its own branding. Preserve fork branding; **do not** adopt upstream's Sim-wordmark favicons or landing/SEO redesigns (#5535, #5587, #5689, #5887, #5990, #5996, etc.).
3. **Copilot generated contracts** `lib/copilot/generated/tool-catalog-v1.ts` / `tool-schemas-v1.ts` → `upstreamFirst` per policy, then regenerate via `bun run mship:generate` post-merge. (The fork's `generated/mothership-stream-v1.ts` is fork-owned, synced via `scripts/sync-mothership-stream-contract.ts` — tied to Decision 1.)
4. **Block registry** (`registry-maps.ts`) — fork blocks are neatly isolated in `ARENA_CUSTOM_BLOCK_REGISTRY` / `ARENA_CUSTOM_BLOCK_META_REGISTRY` spread objects; structure is already post-#6083. Mechanical union — keep the fork spread objects, take upstream's map + new blocks.
5. **Tool registry** (`tools/registry.ts`) — fork is **pre** the upstream perf refactor (#6138 family): single 8933-line eager-import file with ~65 fork tool entries (`arena_*`×19, `unipile_*`×20, `p2_docs_*`×3, `facebook_ads_query`, `presentation_create`, `arena_development_*`) interleaved inline. Adopt upstream's refactor, re-register the fork tools, and regenerate the new serializable tool-metadata artifacts. High-touch but mechanical (manual-review area).
6. **Migrations / schema** — fork uses a non-standard runner (`packages/db/scripts/migrate.ts` + `script-migrations/`) with hand-authored SQL that already collides on numbers in the 02xx range (`local_copilot` family 0248–0251 + 0261, `0252_chat_deployment_type`, etc.) and is not fully tracked in `meta/_journal.json`. Schema is one monolithic `schema.ts` (124 tables) with fork Arena tables (`user_arena_details`, `arena_task_summary`, Arena Copilot access/memory) interleaved. Upstream's new migrations (folders engine, tables column types, saved views, org session policies) will collide → renumber fork migrations after upstream's, reconcile the journal, run the `db-migrate` skill. Manual review.
7. **Dependency bumps & lockfiles** (`package.json`, `apps/sim/package.json`, `bun.lock`, `next.config.ts`) → upstream wins (shared infra): next 16.2.12, better-auth 1.6.23, sharp, js-yaml, react-email v6, `@daytona/sdk` rename, otel 2.8.0.
8. **`lib/auth/auth.ts`** → upstream wins on the security bump (better-auth 1.6.23 + trusted-proxy client-IP #5857, org session policies #5862, email-otp gating #5840) while preserving fork imports; fork-owned `session-cookie-domain.ts` / `legacy-session-cookie-clears.ts` did **not** conflict and stay intact.
9. **PII/GLiNER** (#5697 drop GLiNER/GPU image, #5552 CUDA torch) → N/A. The fork carries **no** GLiNER/GPU/CUDA reference in any compose file; nothing to reconcile.

### Open decisions (require human input — posted to PR #677)

1. **Copilot/"mothership" conflict strategy + stale merge policy (BLOCKING).** Upstream's mothership-v0.8 copilot rewrite (#5410 + tail) collides with the fork's large, renamed "mothership" copilot surface: `lib/mothership/` (inbox subsystem), `local-copilot/` (delegated tools, history), `app/api/mothership/*`, `app/workspace/[workspaceId]/home/components/mothership-*`, `blocks/blocks/mothership.ts`, `executor/handlers/mothership/`, `stores/mothership-*` + `stores/chat/*`, `lib/copilot/chat/*`, `lib/billing/core/mothership-chat-attribution*`. **The merge policy's `forkFirst` list does not cover any of these** — it lists `apps/sim/app/chat/`, which **does not exist** in the repo. Need: (a) fork-first vs selective-adopt for the copilot rework, and (b) an updated `forkFirst` list enumerating the real mothership paths so future syncs auto-resolve.
2. **CI workflows (BLOCKING).** `.github/workflows/ci.yml` conflicts: the fork carries deploy-critical GHCR/`p2-sim`/Blacksmith references (no `CI_PROVIDER` toggle yet) while upstream restructured CI (#5808 `CI_PROVIDER` toggle, runner sizing, cache changes). `.github/workflows/` is not in the merge policy; the policy note says "upstream wins on CI," but a blind upstream take erases the fork's registry/deploy wiring. Also upstream deleted `i18n.yml` (#2f9144eb) which the fork still has. Need: preserve fork CI/deploy refs + layer upstream structure (recommended) vs take upstream wholesale; and whether to delete `i18n.yml`.
3. **bunfig supply-chain gate (advisory).** Fork sets `minimumReleaseAge = 0` (gate disabled, no excludes); upstream #5523 re-enabled it with scoped excludes. Not a merge conflict (won't auto-apply), so the gate stays **off** unless directed otherwise. Confirm keep-off vs adopt upstream's gate.
4. **Desktop app #5998 (advisory).** New additive surface (`apps/desktop` + desktop prerelease CI). No conflict; default is to take it (additive under fork-first). Confirm adopt-and-maintain vs exclude to limit fork surface.

_Proceeding defaults if unanswered: Decisions 1–2 block automated resolution of the copilot and CI conflicts; the harness/child agents should treat mothership + copilot conflicts as **fork-first** and preserve fork CI refs pending an answer. Advisory 3 → keep gate off. Advisory 4 → take desktop app._


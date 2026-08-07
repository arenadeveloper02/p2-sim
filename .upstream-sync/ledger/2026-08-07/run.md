# Upstream Sync Run — 2026-08-07

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `2a626739`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `578d9ddc` (lastSyncedUpstreamSha)
- **Commits in sync range:** 142
- **Merge tip:** next-releases v0.7.44…v0.7.49 (n=6) (`2a626739`; full upstream HEAD `d5ce247b`)

## Grill analysis

### Measurement (read-only, before any merge)

Standard three-step from the extensibility notes, plus the two silent-hazard audits
added on run 2026-08-06-5.

| Step | Command | Result |
|---|---|---|
| merge-base | `git merge-base HEAD 2a626739` | `578d9ddc` — equals the analysis baseline, so the 142-commit range is exact |
| overlap | `comm -12` of upstream-changed vs fork-changed files | 1835 upstream × 1688 fork → **222-file overlap** |
| predict | `git merge-tree --write-tree HEAD 2a626739` | exit 1, tree `de2ad423`, **89 conflicted files** |

Conflict types: **83 content**, **3 modify/delete**, **5 add/add**, zero renames.
Ranked by conflicted-line count the work concentrates in `bun.lock` (766), the four
`meta/*_snapshot.json` add/adds (~870 combined), `use-chat-streaming.ts` (270),
`(interfaces)/chat/[identifier]/chat.tsx` (217) and `api/workspaces/route.ts` (204).

### Silent hazards — files git reports CLEAN that are wrong

These produced no conflict markers, so no child agent would ever open them.

1. **`packages/db/migrations/meta/_journal.json` auto-merged into duplicate `idx` values —
   again.** Merged journal has 281 entries with `idx` 266, 267, 268 and 269 each appearing
   **twice**. The fork occupies 0266–0269 (renumbered from upstream's 0262–0265 on the
   previous run); upstream's new `0266_spotty_alex_power` … `0276_drop_legacy_folder_tables`
   land on the same indices. (A duplicate `idx: 239` also appears — it is present at the
   baseline too, so it is pre-existing, not sync-caused.)
2. **`apps/sim/lib/copilot/tools/server/files/delete-file.ts` is silently deleted.** Upstream
   retired the copilot `delete_file` / `delete_file_folder` tools; the fork never modified the
   file since base, so git takes the deletion with no conflict. `tool-schemas-v1.ts`
   auto-merges to **zero** `delete_file` occurrences. Census: `DeleteFile` / `DeleteFileFolder`
   = base 1, fork 1, upstream 0, merged 0. The fork-only `apps/sim/local-copilot/` still
   advertises and delegates both names (`orchestrator.ts`, `specialists/domains.ts`,
   `mothership-delegated-tool-defs.ts`), so this breaks Arena's local copilot at **runtime**,
   not at build time. `router.ts` does conflict and still references `[DeleteFile.id]`, so a
   naive `--ours` there is a hard build break instead.
3. **`apps/sim/package.json` keeps a fork-only `overrides` block pinning `next` to 16.2.6**
   while the root `package.json` overrides auto-merged to upstream's **16.2.12** (#5890 and
   #6077, both security-advisory bumps). Split pin, and the fork's pin is the vulnerable one.
4. **`apps/sim/lib/invitations/` auto-merges wholesale.** The fork has never touched this
   directory, so upstream #5918's join-time workspace sweep lands complete with no conflict —
   a live behaviour change delivered by a "clean" merge (see Q2).

The catalog assertion from runs 3–5 **passes correctly** this time: the fork's
`Drive handles GFM import` sentence is at merged line 4602, owned by
`export const Superagent` (line 4593) — the right tool. `Superagent`, `Research`,
`UserMemory`, `MoveFile`, `MoveFileFolder`, `RenameFile`, `RenameFileFolder` all survive
(fork 1 / merged 1). Only the two `DeleteFile*` entries are lost.

### Upstream FBIs worth calling out

- **#6074 Exa refresh** — Exa's dev-rel flagged the integration as written against a retired
  API. `/research/v1` returns **HTTP 410 RESEARCH_RETIRED**, so the fork's `exa_research`
  operation is already hard-broken in production. Upstream deletes it, adds `exa_agent` on
  `/agent/runs`, routes saved `exa_research` workflows to Agent, and preserves the research
  output shape. Upstream's block already carries all four of the fork's crawl/published-date
  subBlocks (marked deprecated but working).
- **#5918 organizations** — sweeps a joiner's owned workspaces into the org on accept, adds
  disclosure copy, a billing-identity lock, `observedOrganizationId`, and external workspace
  invites. Collides head-on with the fork's own "Personal workspace attaching to Org" model.
- **#5545/#5922/#5925/#5915 providers** — prompt-caching capability, Claude Opus 5, and a new
  `providers/cost-policy.ts` that centralises the billability gate + margin multiplier.
- **#5671/#5956 agent streaming** — thinking and tool-call SSE, opt-in per workflow execution;
  adds `includeThinking` / `includeToolCalls` columns to `chat` and to the execution snapshot.
- **#6028 enterprise self-host flags** — `ENTERPRISE_ENABLED` plus per-feature switches.
  **Audited and inert for Arena:** `enterprise-entitlements.ts` resolves an unset flag to a
  per-feature legacy default that reproduces prior behaviour exactly, and the merged
  `isOrganizationsEnabled` / `isAccessControlEnabled` expressions are semantically identical
  to the baseline. No feature silently flips on or off.
- **#5998/#6086/#6065 desktop app** — large but additive; the new settings sections are gated
  behind `item.requiresDesktopSurface`, so they self-hide in a browser. No suppression needed.
- **#6037/#6025/#6045/#6051 generic folders** — 11 upstream migrations, all mechanical once
  renumbered.
- **#5911 setup wizard** — a CLI/compose flow, not an app route. Cannot intercept Arena traffic.
- **#5988 non-canonical host noindex** — `isNonCanonicalSimHost` compares against
  `CANONICAL_SITE_HOST`, so it is host-relative and safe under the fork's redefined `isHosted`.

### Fork-owned surfaces at risk

- `lib/workspaces/policy.ts` + `workspace.is_personal` (fork-authored, migration `0248`) —
  the subject of Q1.
- `providers/utils.ts::resolveBlockModelCost` — fork-authored (base 0 / fork 13 / upstream 0),
  also consumed by the fork-only `lib/billing/core/historical-workflow-reconciliation.ts`.
- `tools/exa/hosting.ts` — fork-authored hosted-key metering, superseded by upstream's inline
  `hosting` blocks.
- `app/api/auth/socket-token/route.ts` — the fork's session-row restore path.
- `apps/sim/local-copilot/` — depends on the two retired `delete_file*` copilot tools.
- Arena landing brand strings in `(landing)/components/hero`, `home-structured-data`, `page.tsx`
  (fourth consecutive sync conflicting on the same lines).

### Resolved without asking — the reasoning

- **Exa / Firecrawl (14 conflicts): upstream-first.** Upstream verified every claim against the
  live API with a real key; the fork's `exa_research` is a 410. Both sides independently built
  hosted-key billing with the *same* `envKeyPrefix` / `byokProviderId`, so this is convergence,
  not a product fork. Only the `apiKey` subBlock needs re-applying.
- **Router/Evaluator cost basis: upstream-first.** In the merged tree `providers/index.ts`
  applies `applyModelCostPolicy` / `installStreamingCostPolicy` centrally, so keeping the fork's
  `resolveBlockModelCost` at those two call sites would apply the margin **twice**. Upstream's
  `cost-policy.ts` contains both of the fork helper's concerns (BYOK billability gate + margin),
  which is exactly the condition the human set on run 2026-08-06-4 Q1 ("B if all the features of
  A are already included there"). The export stays for the fork-only reconciliation job.
- **`delete_file` family: restore additively.** Run 2026-08-06-5 precedent — restoring is
  unconditionally safe on the upstream side; taking the deletion orphans fork capability.
- **`socket-token/route.ts`: fork-first.** The fork's flow already does upstream's forced
  `disableCookieCache` DB read and then adds a restore path; fork-first is the status quo and
  therefore the no-change option. Logged as a follow-up because the restore can resurrect a
  session row upstream deliberately wants to 401.
- **`next.config.ts` `turbopackFileSystemCacheForBuild`: fork-first.** Added by the fork in
  `90f7b489cb` ("fix: turbo cache eviction and swap bump") for its own EC2/GHCR build; upstream
  #6080 removed it for their runners. Fork build config wins, flagged for re-evaluation.
- **Enterprise flags, desktop app, setup wizard, host noindex:** audited above, all inert.

### Open decisions

Two, both genuine fork-vs-upstream product calls in the same subject area, posted to PR #690.
See `open-questions.md`.

## Parent plan

Draft: `.upstream-sync/ledger/2026-08-07/merge-plan.draft.json` (`kind: "draft"`).

### Self-resolutions (no human input needed)

| # | Decision | Scope | Strategy |
|---|---|---|---|
| 1 | Fork CI/infra ownership | `.github/workflows/ci.yml` | `ours` |
| 2 | Renumber upstream migrations `0266–0276` → `0270–0280`; keep fork `0266–0269`; rebuild journal | `packages/db/migrations/` | `mustEdit` |
| 3 | Union both new schema slices (chat `includeThinking`/`includeToolCalls` + fork `deploymentType`/`redirectUrl`; both usage-log indexes) | `packages/db/schema.ts` | `union` |
| 4 | Adopt upstream's validated Exa/Firecrawl refresh, drop `exa_research`, re-apply the hidden/optional `apiKey` subBlock | `apps/sim/tools/exa/`, `apps/sim/tools/firecrawl/`, `apps/sim/blocks/blocks/exa.ts` | `theirs` + `mustEdit` |
| 5 | Restore `delete_file` / `delete_file_folder` additively | `lib/copilot/generated/`, `tools/server/files/delete-file.ts`, `tools/server/router.ts` | `mustEdit` |
| 6 | Router/Evaluator use `resolveProxiedModelCost`; keep `resolveBlockModelCost` exported | `executor/handlers/{router,evaluator}/` | `theirs` + `mustEdit` |
| 7 | Single `next` version (16.2.12) across all four pin sites | `package.json`, `apps/sim/package.json` | `mustEdit` |
| 8 | Fork brand strings win on the landing surface | `(landing)/components/hero`, `home-structured-data`, `page.tsx` | `ours` |
| 9 | Fork session-restore path wins | `app/api/auth/socket-token/route.ts` | `ours` |
| 10 | Keep the fork's Turbopack build cache flag | `apps/sim/next.config.ts` | `ours` (union rest) |
| 11 | Everything else in the chat/streaming, copilot, shell, home, misc clusters | see clusters below | `union` |
| 12 | Regenerate, never hand-merge | `bun.lock` | `mustEdit` |

### Child clusters (area-level; files assigned in Phase B after the merge)

| id | area | conflicts | strategy |
|---|---|---|---|
| `db-schema-migrations` | `packages/db/` | 5 + journal + 11 renumbers | union / mustEdit |
| `infra-manifests` | workflows, manifests, `next.config`, `proxy`, `.env.example` | 8 | mixed |
| `chat-agent-stream` | deployed chat + SSE + execute route | 14 | union |
| `tools-hosted-keys` | Exa / Firecrawl / Shopify / `tools/index.ts` | 14 | theirs + mustEdit |
| `org-workspace-policy` | policy, workspaces route, invite, credentials access | 8 | **gated on Q1/Q2** |
| `copilot-generated` | catalog, router, tool-display, chat lifecycle | 7 | union + additive restore |
| `shell-settings-desktop` | layouts, sidebar, settings sidebar, whitelabeling, socket | 8 | ours-on-brand + union |
| `home-mothership` | mothership chat surface | 6 | union (+2 test deletions) |
| `providers-cost` | providers + executor handlers | 6 | theirs |
| `misc-client-hooks` | KB hooks, oauth hooks, request client, billing, polling, landing | 13 | union |

### Post-merge verification (mandatory, regardless of answers)

1. `packages/db/migrations/meta/_journal.json` — every `idx` unique except the pre-existing
   239 duplicate; 281 entries; upstream's block at 270–280.
2. `grep -c "Drive handles GFM import"` **and** the owning export is `Superagent`.
3. Every fork-consumed catalog export present: `Superagent`, `Research`, `UserMemory`,
   `MoveFile`, `MoveFileFolder`, `RenameFile`, `RenameFileFolder`, `DeleteFile`,
   `DeleteFileFolder`.
4. `next` identical across root overrides, root `optionalDependencies` (`@next/swc-*`),
   `apps/sim` dependencies and `apps/sim` overrides.
5. No duplicate identifiers in the `dedupeOnUnion` files — `tool-display.ts` has a measured
   duplicate `file: 'File Agent'` key on both sides of its conflict.
6. `bun run build` passes.

### Fork follow-ups surfaced (not sync-caused)

- `app/invite/[id]/invite.tsx` auto-logs users in with a **hardcoded password literal**
  (`'Position2!'`) in client-shipped code. Not introduced by this sync; worth removing.
- The `socket-token` restore path can recreate a session row upstream deliberately 401s after
  sign-out. Confirm that is intended for Arena's cookie-domain migration.
- `meta/` snapshot gap is still unbackfilled, and the fork's renumbered `0266–0269` snapshots
  describe upstream's schema rather than the fork's.
- The copilot catalog overlay (moving the fork's entries + GFM sentence out of the generated
  file) is still the standing fix for the recurring `lib/copilot/generated/` hazard.
- Arena brand strings still live inline in `(landing)` JSX; move them to `lib/branding/`.
- Re-evaluate `turbopackFileSystemCacheForBuild` against upstream's measured 3.2× build win.

## Usage

### parent-grill-analysis
- **Model:** `claude-opus-5`
- **Iterations:** 1
- **Input tokens (direct):** 1,644
- **Input tokens (cache read):** 12,453,323
- **Input tokens (cache create):** 238,206
- **Input tokens (total):** 12,693,173
- **Output tokens:** 77,159
- **Cost:** $9.655848 (provider-reported)

### Totals
- **Total input tokens:** 12,693,173
- **Total output tokens:** 77,159
- **Primary models:** claude-opus-5
- **Total cost:** $9.655848
- **Provider-reported cost:** $9.655848

### Cost by agent
- **parent-grill-analysis:** $9.655848 (provider-reported)

## Status

awaiting_input

## Open questions

Grill left unanswered product decisions in `open-questions.md`. Merge will not start until `/upstream-sync resume`.


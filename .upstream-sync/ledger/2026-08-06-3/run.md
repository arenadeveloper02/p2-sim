# Upstream Sync Run — 2026-08-06-3

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `e01bfb14`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `207785c8` (lastSyncedUpstreamSha)
- **Commits in sync range:** 6
- **Merge tip:** next-release v0.7.31 (`e01bfb14`; full upstream HEAD `e1ab24c1`)

## Grill analysis

### Measured conflict surface (done first, per 2026-08-06-2 finding)

`git merge-base HEAD e01bfb14` = `207785c8` — the analysis baseline **is** the merge-base, so
the upstream delta is exactly the 6 commits in range.

| Metric | Count |
| --- | --- |
| Upstream-changed files (`207785c8..e01bfb14`) | 12 |
| Fork-changed files vs same baseline | 1623 (full fork divergence) |
| **Overlap (`comm -12`) — true conflict candidates** | **3** |

Overlapping files:

1. `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx`
2. `apps/sim/lib/copilot/generated/tool-schemas-v1.ts`
3. `apps/sim/lib/workflows/migrations/subblock-migrations.ts`

### Predicted merge result — clean, zero conflicts

`git merge-tree --write-tree HEAD e01bfb14` (read-only, no working-tree mutation) returned tree
`b4f398d7` with **exit 0 and no conflicted-file list**. Every overlapping hunk pair is
non-adjacent, so the three-way merge takes both sides. Verified against the predicted tree:

| Check | Result |
| --- | --- |
| Fork Superagent GFM sentence (`Drive handles GFM import`) survives | ✅ present |
| Upstream unquoted `superagent: {` key applied | ✅ present, 0 residual `['x']:` keys |
| Upstream `toggle-sidebar` command in sidebar | ✅ present |
| Fork sidebar branding (`handleOpenArenaDocs`, `hideSidebarForArenaV3`) survives | ✅ 4 refs |
| Upstream ashby `filterCandidateId` migration entry | ✅ present |
| Fork zoom `ZOOM_OAUTH_CANONICAL_IDS` backfill survives | ✅ present |

### Upstream FBIs in this batch

| PR | Change | Fork impact | Call |
| --- | --- | --- | --- |
| [#5618](https://github.com/simstudioai/sim/pull/5618) | `feat(sidebar)`: Cmd/Ctrl+B toggles sidebar collapse; `SidebarTooltip` gains `shortcut` prop | Touches heavily fork-modified `sidebar.tsx`, but hunks are 14+ lines from any fork hunk | **Take** |
| [#5619](https://github.com/simstudioai/sim/pull/5619) | `fix(webhooks)`: resolve `{{ENV_VAR}}` refs in `providerConfig` before deploy-triggered subscription creation | No fork divergence in `lib/webhooks/`; dep `lib/webhooks/env-resolver.ts` exists in fork | **Take** |
| [#5621](https://github.com/simstudioai/sim/pull/5621) | `fix(ashby)`: parse `alternateEmailAddresses` / `socialLinks` into arrays before dispatch | Ashby is 100% upstream-owned in the fork (zero fork commits touch it) | **Take** |
| [#5623](https://github.com/simstudioai/sim/pull/5623) | `fix(global-commands)`: use `isContentEditable` for the editable guard | No fork divergence in `global-commands-provider.tsx` / `commands-utils.ts` | **Take** |
| [#5624](https://github.com/simstudioai/sim/pull/5624) | `fix(ashby)`: fail loudly on malformed `socialLinks`; drop `filterCandidateId` subblock + add `_removed_` migration | Upstream removes `filterCandidateId` from `ashby.ts`/`list_applications.ts`/`types.ts` and migrates it — merged tree has **zero dangling refs** | **Take** |
| `e01bfb14` | v0.7.31 release commit — reformats `lib/copilot/generated/tool-schemas-v1.ts` keys (`['x']:` → `x:`, 96 keys). Formatting only, no schema change | Collides in-file with the fork's hand-edited Superagent `task` description, but 5 lines apart → merges clean | **Take** |

Nothing skipped. `skipped.md` stays empty for this run.

### Fork-owned paths at risk

- **`lib/copilot/generated/tool-schemas-v1.ts`** — the standing `upstreamFirst` +
  `mustEdit` caveat. Auto `--theirs` on this prefix would silently delete the fork's Superagent
  GFM sentence (which exists in no generator source, and `mship:generate` cannot run in this
  checkout — `scripts/sync-tool-catalog.ts` reads the absent sibling `../copilot/`). **This run
  it does not matter**: the natural three-way merge already keeps both sides. The plan therefore
  does *not* checkout-theirs this file — it lets the clean merge stand, with a verify-only
  `mustEdit` guard in case the harness path differs.
- **`sidebar.tsx`** — carries Arena branding (`useOrgBrandConfig`, `resolveBrandDocsUrl`,
  support/terms/privacy menu items), `arenaMixpanelEvents`, `getArenaHubAgentsUrl`, and the
  `from=arena_v3` hide flag. All preserved.

### Audit checks run (both directions, per 2026-08-06-2 finding)

- **`isHosted` audit** — `grep` over the full upstream diff for `isHosted` / `isProd` / `sim.ai`
  / new `process.env.` reads: **zero hits**. No hosted-gated behavior enters the fork this slice.
- **Fork-superset audit** — none of the 12 upstream files has a fork superset that `--theirs`
  would regress; only 3 have any fork edit at all, and all 3 merge additively.
- **Build-prerequisite audit** — upstream's new `Tooltip.Shortcut` usage resolves
  (`packages/emcn/src/components/tooltip/tooltip.tsx:468`, exported at :556); upstream's new
  `resolveWebhookProviderConfig` import resolves (`apps/sim/lib/webhooks/env-resolver.ts`).
- **Shortcut-collision audit** — `Mod+B` / `key === 'b'` has no fork binding. The only hit is an
  upstream test fixture (`global-commands-provider.test.tsx:82` `data-owned-shortcuts='Mod+B'`),
  which exercises the owned-shortcuts escape hatch, not a real command.

### Follow-ups (not blockers, not sync-caused)

- `from=arena_v3` embeds apply `hidden` to the sidebar rather than unmounting it, so Cmd+B will
  toggle collapse state with no visible effect in that mode. Cosmetically inert — no fork change
  proposed here. If Arena wants the shortcut suppressed in embed mode, gate the
  `toggle-sidebar` registration on `!hideSidebarForArenaV3` in a follow-up PR.
- The `regenerateAfterMerge` hook (`bun run mship:generate`) still cannot run in this checkout.
  It is unnecessary this slice — upstream's generated-file change is pure key formatting and is
  already carried by the merge.

## Parent plan

### Self-resolutions

- **Take upstream wholesale for all non-overlapping files in this slice** (`theirs`): apps/sim/app/workspace/[workspaceId]/providers/global-commands-provider.tsx, apps/sim/app/workspace/[workspaceId]/providers/global-commands-provider.test.tsx, apps/sim/app/workspace/[workspaceId]/utils/commands-utils.ts, apps/sim/blocks/blocks/ashby.ts, apps/sim/blocks/blocks/ashby.test.ts, apps/sim/lib/webhooks/provider-subscriptions.ts, apps/sim/lib/webhooks/provider-subscriptions.test.ts, apps/sim/tools/ashby/list_applications.ts, apps/sim/tools/ashby/types.ts — comm -12 of upstream-changed vs fork-changed files (both vs merge-base 207785c8) shows zero fork edits to any of these 9 files, so they fast-forwarded with no conflict. Direction-audited both ways: no isHosted/isProd/sim.ai gate anywhere in the upstream diff (grep: 0 hits), and no fork superset that --theirs would regress. Build prerequisites resolve in-tree: Tooltip.Shortcut at packages/emcn/src/components/tooltip/tooltip.tsx:468 (exported :556) and apps/sim/lib/webhooks/env-resolver.ts both exist. Upstream removes the ashby filterCandidateId subblock; the merged tree has zero dangling refs in ashby.ts, list_applications.ts, and types.ts. Mod+B has no fork binding (only an upstream test fixture at global-commands-provider.test.tsx:82). CONFIRMED in Phase B: the harness merge (2b121cb2) left zero unmerged paths. (FBI 2026-08-06-3 / simstudioai/sim#5618 #5619 #5621 #5623 #5624 / extensibility-notes 2026-08-06-2 'measure the overlap before planning' + 'isHosted audit cuts both ways')
- **Let the natural three-way union stand on sidebar.tsx — keep Arena branding, take upstream Cmd+B** (`union`): apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx — Upstream #5618 changes old lines 120, 1236 and 1288; the nearest fork hunks are at old lines 1256-1268 and 1653+, i.e. 14+ lines away, so no hunk pair is adjacent. git merge-tree --write-tree predicted a clean merge (tree b4f398d7, exit 0). CONFIRMED in Phase B against the real merged worktree: toggle-sidebar registration present (1 hit), Tooltip.Shortcut present (3 hits), fork branding/arena refs present (8 hits across handleOpenArenaDocs / hideSidebarForArenaV3 / useOrgBrandConfig / createWorkflowEvent), and docs.sim.ai absent (0 hits — upstream's handleOpenDocs was not restored). No child work required. (simstudioai/sim#5618 / merge-policy unionPaths / git merge-tree b4f398d7)
- **Do NOT checkout --theirs on lib/copilot/generated/tool-schemas-v1.ts this slice; the clean merge already preserves the fork hand-edit** (`union`): apps/sim/lib/copilot/generated/tool-schemas-v1.ts — The standing upstreamFirst prefix would auto-resolve --theirs and silently delete the fork's Superagent task-description addendum (the Google Docs GFM sentence), which exists in NO generator source and cannot be regenerated here because scripts/sync-tool-catalog.ts:8 reads the absent sibling repo ../copilot/. Upstream's only change in this file is biome key reformatting (['x']: -> x:, 96 keys, zero schema change) at old line 3537; the fork's edit is at old line 3542 — 5 lines apart, so git merged both. CONFIRMED in Phase B against the real merged worktree: 'Drive handles GFM import' present (1 hit), unquoted 'superagent: {' present (1 hit), 0 residual ['x']: keys. The verify-only mustEdit from the draft is therefore DISCHARGED and not carried into the locked directives — the file is no longer unmerged and needs no edit. bun run mship:generate must NOT be run. (merge-policy.json description CAVEAT / extensibility-notes 2026-08-06-2 'upstreamFirst + regenerateAfterMerge is unsafe for lib/copilot/generated/')
- **Union subblock-migrations.ts — upstream ashby _removed_filterCandidateId entry plus fork zoom canonical-mode backfill** (`union`): apps/sim/lib/workflows/migrations/subblock-migrations.ts — Classic additive-both-sides on a shared record map. Upstream adds one key inside the ashby map (old lines 46-49); the fork adds a zoom map at old lines 27-31 and a Zoom OAuth backfill branch at old 193+/229+. No hunk overlap. CONFIRMED in Phase B against the real merged worktree: _removed_filterCandidateId present (1 hit) and ZOOM_OAUTH_CANONICAL_IDS present (2 hits). Path is in merge-policy unionPaths so the next sync inherits the rule. (simstudioai/sim#5624 / merge-policy unionPaths)

### Child areas

- _None_

PHASE B FINAL — zero remaining conflicts, zero child clusters. 12 upstream files across 6 commits (#5618 #5619 #5621 #5623 #5624 + v0.7.31 release e01bfb14); only 3 overlapped the fork and all 3 merged additively. All three draft child clusters (sidebar-cmd-b, copilot-generated-schemas, subblock-migrations-union) were CONTINGENCY-ONLY scaffolding conditioned on the harness merge conflicting; it did not, so none are instantiated and all are dropped from the active plan. Every fork invariant re-verified by grep against the real post-merge worktree, not just the predicted tree: sidebar toggle-sidebar + Tooltip.Shortcut present with 8 Arena/branding refs intact and 0 docs.sim.ai refs; tool-schemas-v1.ts carries the fork Superagent GFM sentence with upstream's unquoted keys fully applied; subblock-migrations.ts carries both the upstream _removed_filterCandidateId entry and the fork ZOOM_OAUTH_CANONICAL_IDS backfill. No open questions were raised this run (open-questions.md: none), so no grill answers needed mapping and no settled decision was re-opened. Nothing skipped — skipped.md stays empty. merge-policy.json gained two unionPaths this run: the sidebar and subblock-migrations paths.


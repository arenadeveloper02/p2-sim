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

**Status: FINAL (Phase B) — merge applied, zero unmerged paths, zero child clusters.**

The harness merged `e01bfb14` into the sync branch (merge commit `2b121cb2`) and the working tree
came back **clean — no conflicted paths at all**, exactly as `git merge-tree --write-tree` predicted
in Phase A (tree `b4f398d7`, exit 0). No open questions were raised this run
(`open-questions.md`: none), so there were no grill answers to map and no settled decision to
re-open.

### Post-merge invariant verification (real worktree, not the predicted tree)

Every Phase-A prediction was re-checked by grep against the actual merged files:

| File | Check | Result |
| --- | --- | --- |
| `tool-schemas-v1.ts` | Fork Superagent GFM sentence (`Drive handles GFM import`) | ✅ 1 hit |
| `tool-schemas-v1.ts` | Upstream unquoted `superagent: {` key | ✅ 1 hit |
| `tool-schemas-v1.ts` | Residual `['x']:` quoted keys | ✅ 0 |
| `sidebar.tsx` | Upstream `toggle-sidebar` command | ✅ 1 hit |
| `sidebar.tsx` | Upstream `Tooltip.Shortcut` | ✅ 3 hits |
| `sidebar.tsx` | Fork Arena/branding refs | ✅ 8 hits |
| `sidebar.tsx` | Upstream `docs.sim.ai` docs link restored? | ✅ 0 hits (correctly absent) |
| `subblock-migrations.ts` | Upstream `_removed_filterCandidateId` | ✅ 1 hit |
| `subblock-migrations.ts` | Fork `ZOOM_OAUTH_CANONICAL_IDS` | ✅ 2 hits |

### Locked directives

All directive lists are **empty**. Directives may only target still-unmerged paths and none remain.
The draft's single verify-only `mustEdit` on `apps/sim/lib/copilot/generated/tool-schemas-v1.ts` is
**discharged**, not re-issued — the invariant was confirmed intact above, and re-issuing it would
risk a child overwriting an already-correct file. The `regenerateAfterMerge` hook
(`bun run mship:generate`) is **skipped**: upstream's change to the generated file is pure key
formatting already carried by the merge, and `scripts/sync-tool-catalog.ts` cannot resolve the
absent sibling repo `../copilot/` in this checkout.

### Child clusters

**None.** All three draft clusters — `sidebar-cmd-b`, `copilot-generated-schemas`,
`subblock-migrations-union` — were explicitly *contingency-only* scaffolding, conditioned on the
harness merge actually conflicting. It did not conflict, so none are instantiated. No Luna children
this run; proceed straight to coherence + build-fix. Nothing skipped — `skipped.md` stays empty.

### Self-resolutions (locked, all applied clean)

- **Take upstream wholesale for all non-overlapping files in this slice** (`theirs`): apps/sim/app/workspace/[workspaceId]/providers/global-commands-provider.tsx, apps/sim/app/workspace/[workspaceId]/providers/global-commands-provider.test.tsx, apps/sim/app/workspace/[workspaceId]/utils/commands-utils.ts, apps/sim/blocks/blocks/ashby.ts, apps/sim/blocks/blocks/ashby.test.ts, apps/sim/lib/webhooks/provider-subscriptions.ts, apps/sim/lib/webhooks/provider-subscriptions.test.ts, apps/sim/tools/ashby/list_applications.ts, apps/sim/tools/ashby/types.ts — comm -12 of upstream-changed vs fork-changed files (both vs merge-base 207785c8) shows zero fork edits to any of these 9 files, so they fast-forward with no conflict. Direction-audited both ways: no isHosted/isProd/sim.ai gate anywhere in the upstream diff (grep: 0 hits), and no fork superset that --theirs would regress. Build prerequisites resolve in-tree: Tooltip.Shortcut at packages/emcn/src/components/tooltip/tooltip.tsx:468 (exported :556) and apps/sim/lib/webhooks/env-resolver.ts both exist. Upstream removes the ashby filterCandidateId subblock; the predicted merged tree has zero dangling refs in ashby.ts, list_applications.ts, and types.ts. Mod+B has no fork binding (only an upstream test fixture at global-commands-provider.test.tsx:82). (FBI 2026-08-06-3 / simstudioai/sim#5618 #5619 #5621 #5623 #5624 / extensibility-notes 2026-08-06-2 'measure the overlap before planning' + 'isHosted audit cuts both ways')
- **Let the natural three-way union stand on sidebar.tsx — keep Arena branding, take upstream Cmd+B** (`union`): apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx — Upstream #5618 changes old lines 120, 1236 and 1288; the nearest fork hunks are at old lines 1256-1268 and 1653+, i.e. 14+ lines away, so no hunk pair is adjacent. git merge-tree --write-tree confirms a clean merge (tree b4f398d7, exit 0, no conflicted files) and the predicted tree contains BOTH upstream's toggle-sidebar command registration AND all 4 fork branding/arena refs (handleOpenArenaDocs, hideSidebarForArenaV3, useOrgBrandConfig, createWorkflowEvent). No child work required unless the harness merge diverges. (simstudioai/sim#5618 / merge-policy unionPaths (added this run) / git merge-tree b4f398d7)
- **Do NOT checkout --theirs on lib/copilot/generated/tool-schemas-v1.ts this slice; the clean merge already preserves the fork hand-edit** (`union`): apps/sim/lib/copilot/generated/tool-schemas-v1.ts — The standing upstreamFirst prefix would auto-resolve --theirs and silently delete the fork's Superagent task-description addendum (the Google Docs GFM sentence), which exists in NO generator source and cannot be regenerated here because scripts/sync-tool-catalog.ts:8 reads the absent sibling repo ../copilot/. Upstream's only change in this file is biome key reformatting (['x']: -> x:, 96 keys, zero schema change) at old line 3537; the fork's edit is at old line 3542 — 5 lines apart, so git merges both. Verified in the predicted tree: the GFM sentence is present (1 hit), 'superagent: {' is unquoted (1 hit), and 0 residual ['x']: keys remain. A verify-only mustEdit guards the invariant. bun run mship:generate must NOT be run — it is unnecessary (formatting-only upstream change) and cannot execute in this checkout. (merge-policy.json description CAVEAT / extensibility-notes 2026-08-06-2 'upstreamFirst + regenerateAfterMerge is unsafe for lib/copilot/generated/')
- **Union subblock-migrations.ts — upstream ashby _removed_filterCandidateId entry plus fork zoom canonical-mode backfill** (`union`): apps/sim/lib/workflows/migrations/subblock-migrations.ts — Classic additive-both-sides on a shared record map. Upstream adds one key inside the ashby map (old lines 46-49); the fork adds a zoom map at old lines 27-31 and a Zoom OAuth backfill branch at old 193+/229+. No hunk overlap. Predicted tree carries both: filterCandidateId migration entry (1 hit) and ZOOM_OAUTH_CANONICAL_IDS (2 hits). Added to merge-policy unionPaths so the next sync inherits the rule. (simstudioai/sim#5624 / merge-policy unionPaths (added this run))

### Child areas (draft scaffolding — ALL DROPPED, none instantiated)

Retained below for the record only. Each was contingency-only and its trigger condition (a real
conflict on the path) never fired.

- **sidebar-cmd-b** `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/` (`union`): `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx` — CONTINGENCY ONLY — git merge-tree predicts zero conflicts (tree b4f398d7). Instantiate a child only if the harness merge actually conflicts here. Invariant to preserve on both sides: TAKE upstream's SidebarTooltip `shortcut?: string` prop, the Tooltip.Shortcut render branch, the `toggle-sidebar` entry in useRegisterGlobalCommands, and the shortcut={isMac ? 'Cmd+B' : 'Ctrl+B'} prop on the collapse-button tooltip. KEEP every fork addition: useSearchParams + hideSidebarForArenaV3, getArenaHubAgentsUrl state/effect, SidebarBrandHeader import, useOrgBrandConfig + resolveBrandDocsUrl, createWorkflowEvent mixpanel call in handleCreateWorkflow, and handleOpenArenaDocs / handleContactSupport / handleOpenTerms / handleOpenPrivacy plus their DropdownMenuItems. Never restore upstream's handleOpenDocs pointing at docs.sim.ai.
- **copilot-generated-schemas** `apps/sim/lib/copilot/generated/` (`union`): `apps/sim/lib/copilot/generated/tool-schemas-v1.ts` — CONTINGENCY ONLY — predicted clean. If it does conflict: take upstream's unquoted object keys everywhere (['x']: -> x:) AND keep the fork's Superagent task description ending in '...do not ask to convert or reformat markdown; Drive handles GFM import.' Do NOT auto --theirs despite the upstreamFirst prefix, and do NOT run bun run mship:generate (it cannot resolve ../copilot/ in this checkout).
- **subblock-migrations-union** `apps/sim/lib/workflows/migrations/` (`union`): `apps/sim/lib/workflows/migrations/subblock-migrations.ts` — CONTINGENCY ONLY — predicted clean. If it conflicts: keep both map entries — upstream's ashby.filterCandidateId: '_removed_filterCandidateId' and the fork's zoom map (credentialAdmin/manualCredentialAdmin) plus the ZOOM_OAUTH_CANONICAL_IDS backfill branch in backfillCanonicalModes.

12 upstream files, 3 overlap the fork, git merge-tree --write-tree HEAD e01bfb14 predicts a fully clean merge (tree b4f398d7, exit 0, no conflicted paths) with every fork invariant intact. All three child clusters are contingency scaffolding. Merge-policy updated this run: apps/sim/app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx and apps/sim/lib/workflows/migrations/subblock-migrations.ts added to unionPaths. Nothing skipped — skipped.md stays empty.


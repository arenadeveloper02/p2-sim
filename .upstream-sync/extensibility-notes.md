# Upstream Sync — Extensibility Notes

Rolling log of structural improvements that reduce merge conflict surface with `simstudioai/sim`.

## Principles

- Keep fork-owned code in isolated path prefixes (see `merge-policy.json`).
- Regenerate generated contracts (`bun run mship:generate`) instead of hand-merging.
- Prefer extension hooks over editing upstream-owned files inline.

## Notes

<!-- Agents append dated entries below during each sync run. -->

## 2026-08-05

- **Release-sliced sync:** each Actions run merges the next upstream `vX.Y.Z:` tip; a successful complete dispatches the next unpaid release in a separate job.
- **Parent control plane:** grill writes `merge-plan.draft.json`; resume finalizes `merge-plan.json` + `merge-directives.json`; the harness instantiates Luna children from the plan (prefix clustering is fallback only).
- **Directives + WIP integrity:** `delete` / `mustEdit` / `overrideForkFirst` beat `forkFirst`. WIP sidecars store `decisionHash` + deletion tombstones and are skipped when answers/policy/directives change.
- **Blocking build:** `bun run build` must pass (`child-fix-build`, max 2 rounds) before status `completed`. Lint/test/check stay advisory.

### Grill findings — run 2026-08-05 (v0.7.29)

- **Migration collisions: renumber the *unapplied* side.** When both sides add the same
  migration index, keep the fork's tags/indices (already applied in fork environments) and
  renumber upstream's after the fork's highest idx, keeping `meta/_journal.json` and the
  colliding snapshots as ours and appending journal entries. Copy upstream's SQL verbatim —
  it already carries `COMMIT;` breakpoints + `CREATE INDEX CONCURRENTLY`.
- **Do not `drizzle-kit generate` during a sync.** The fork has a snapshot gap:
  `meta/_journal.json` records `idx: 261` but `meta/` stops at `0260_snapshot.json`
  (`0261_local_copilot_user_memory` was hand-authored without regenerating). A regenerate
  diffs against `0260` and re-emits `0261` as a spurious migration. **Fork follow-up:**
  backfill `meta/0261_snapshot.json` so future syncs can regenerate safely.
- **Brand assets belong in `forkFirst`.** Added `apps/sim/public/favicon/`,
  `apps/sim/public/icon.svg`, `apps/sim/public/logo/` — binary conflicts have no sane
  three-way merge, so they must auto-resolve to ours. The fork's favicon set is only
  *partially* rebranded (`favicon-96x96.png`, `favicon.svg`, `web-app-manifest-*.png` still
  ship Sim art); completing it would remove this conflict class entirely.
- **`isHosted` is fork-redefined — audit every `isHosted`-gated upstream addition.**
  `apps/sim/lib/core/config/env-flags.ts` makes `isHosted` true for `*.thearena.ai` and
  `localhost:3000`, so upstream code written to run "only on sim.ai" runs here too. This
  slice caught upstream's HubSpot loader that way (see `ledger/2026-08-05/skipped.md`); the
  fork also still carries upstream's GTM/GA IDs under the same gate. Treat any new
  `isHosted &&` block in an upstream diff as requiring an explicit take/skip decision.
- **Fork branding is confined to few files.** `SimWordmark` → `ArenaWordmark` in
  `(landing)/components/footer/footer.tsx` and the hero headline/sr-only copy in
  `hero.tsx`. Keeping brand strings behind `lib/branding/` instead of inline JSX would make
  landing-page syncs conflict-free.
- **New unionPaths recorded** from measured additive-both-sides hotspots:
  `lib/oauth/oauth.ts`, `app/api/auth/oauth/utils.ts`, `providers/utils.ts`,
  `components/icons.tsx`, `blocks/blocks/slack.ts`, `lib/core/security/csp.ts`, `proxy.ts`,
  `lib/auth/auth.ts`.

## 2026-08-06

- Consider moving fork registry entries to sidecar import files to reduce registry.ts merge conflicts.

### Grill findings — run 2026-08-06-2 (v0.7.30)

- **Measure the overlap before planning.** `comm -12` of upstream-changed files against
  fork-changed files (both vs the same baseline) reduced this slice from "112 upstream
  files" to a **32-file conflict surface**. Cheap, exact, and it scopes the child clusters
  correctly. Do this first on every run.
- **`upstreamFirst` + `regenerateAfterMerge` is unsafe for `lib/copilot/generated/`.**
  The fork hand-edited the Superagent `task` description (Google Docs GFM guidance) directly
  in the generated output; the sentence exists in **no** generator source. And
  `bun run mship:generate` **cannot run in this checkout** —
  `scripts/sync-tool-catalog.ts:8` reads `../copilot/copilot/contracts/tool-catalog-v1.json`,
  a sibling repo the fork does not have. So auto `--theirs` silently deletes fork prompt
  behavior with no way to restore it. Re-apply via a `mustEdit` directive each sync.
  **Fork follow-up:** either vendor the catalog JSON so `mship:generate` works here, or move
  the addendum into a fork-owned override layer applied on top of the generated file.
- **The `isHosted` audit can also cut the other way — check for fork supersets.**
  Upstream `#5574` (xAI hosted key rotation) looked like a classic `isHosted`-gated risk,
  but the fork already had *more* than upstream: `XAI_API_KEY` + `_1..3`, the `xai` branch in
  `getRotatingApiKey` plus `vertex`/`sambanova`/`google`, `isXaiModel` inside `getApiKey`'s
  hosted gate, and `getProviderModels('xai')` in `getHostedModels`. Taking `--theirs` would
  have **removed** fork capability. Audit means comparing both directions, not just
  "does upstream turn something on for us".
- **`@sim/emcn` barrel re-exports icons** (`packages/emcn/src/index.ts:26` →
  `export * from './icons'`), so upstream files importing `ChevronDown`/`Library` from the
  barrel still compile. Prefer the fork's `@sim/emcn/icons` path for style, but do not flag
  it as a build break.
- **New unionPaths recorded** from this slice's measured additive-both-sides hotspots:
  `lib/core/config/env.ts`, `lib/core/config/api-keys.ts`, `lib/api-key/byok.ts`,
  `lib/api/contracts/byok-keys.ts`, `tools/types.ts`, `next.config.ts`,
  `lib/copilot/chat/payload.ts`, `app/api/files/upload/route.ts`, `app/api/help/route.ts`,
  `app/api/mothership/execute/route.ts`.
- **Pre-existing fork gap surfaced (not sync-caused):**
  `(landing)/demo/.../demo-scheduler.tsx` defaults `CAL_LINK` to `'team/sim/demo'` — Sim's
  calendar. Set `NEXT_PUBLIC_CAL_LINK` for Arena.

## 2026-08-06-2

- Consider moving fork registry entries to sidecar import files to reduce registry.ts merge conflicts.

### Grill findings — run 2026-08-06-3 (v0.7.31)

- **Predict the merge before planning it: `git merge-tree --write-tree` is free and read-only.**
  After the `comm -12` overlap measurement narrowed this slice to 3 candidate files,
  `git merge-tree --write-tree HEAD <upstream-tip>` returned a tree OID with exit 0 and **no**
  conflicted-file list — proving the whole slice merges clean before touching the working tree.
  Then `git show <tree>:<path>` verifies each fork invariant survived, without a merge. Do this
  after the overlap measurement on every run: it turns "3 planned child clusters" into "3
  contingency stubs" and can retire an entire Luna round.
- **Overlapping hunks are not conflicting hunks — check the distance.** All 3 overlap files here
  looked risky and none conflicted. `tool-schemas-v1.ts` was the closest call: upstream's biome
  key reformat lands at old line 3537 and the fork's Superagent addendum at old 3542. Hunk
  *headers* overlap (3534-3540 vs 3539-3545) but the *changed* lines are 5 apart, so git merges
  both. Compare changed-line offsets, not `@@` header ranges, before declaring a conflict.
- **`upstreamFirst` auto-`--theirs` is more dangerous than the conflict it avoids.** The standing
  `lib/copilot/generated/` rule would have force-deleted the fork's Superagent GFM sentence on a
  slice where plain git kept it. When a prefix carries a known hand-edit, the correct move is to
  let the natural merge run and add a **verify-only `mustEdit`**, not to pre-emptively checkout
  theirs and re-patch. Consider narrowing the `upstreamFirst` prefix to exclude
  `tool-schemas-v1.ts` outright.
- **New `unionPaths` recorded** from this slice's measured additive-both-sides hotspots:
  `app/workspace/[workspaceId]/w/components/sidebar/sidebar.tsx` (fork carries Arena branding,
  `arena_v3` embed flag, mixpanel, hub URL; upstream develops it actively) and
  `lib/workflows/migrations/subblock-migrations.ts` (both sides append to the same shared
  `SUBBLOCK_ID_MIGRATIONS` record).
- **Follow-up (pre-existing, not sync-caused):** `from=arena_v3` embeds apply `hidden` to the
  sidebar rather than unmounting it, so upstream's new Cmd+B (`#5618`) toggles collapse state
  with no visible effect in embed mode. Inert, but gating the `toggle-sidebar` registration on
  `!hideSidebarForArenaV3` would be tidier.

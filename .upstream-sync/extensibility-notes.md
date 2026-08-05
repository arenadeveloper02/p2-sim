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

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
- **Parent control plane:** grill writes `merge-plan.draft.json`; resume finalizes `merge-plan.json` + `merge-directives.json` from Q&A + completed cluster reports + prior plan (continue, don’t undo); the harness restricts directives to still-unmerged paths and instantiates Luna children from the plan (prefix clustering is fallback only).
- **Directives + WIP integrity:** `delete` / `mustEdit` / `overrideForkFirst` beat `forkFirst`. WIP sidecars store `decisionHash` + deletion tombstones and are skipped when answers/policy/directives change.
- **Build:** Full `bun run build` is left to CI (`.github/workflows/images.yml`). Harness only runs advisory check/lint/test — dual Next builds OOM the 7GB Actions runner.

## 2026-08-06

- **Migrations: append upstream at the tail, never renumber ours.** drizzle's migrator
  (`drizzle-orm/pg-core/dialect.js:62`) applies a file only when
  `Number(lastDbMigration.created_at) < migration.folderMillis`. Because the fork's migrations
  always carry *later* `when` values than freshly-added upstream ones, the conventional fix
  (renumber the fork's files after upstream's) makes upstream's migrations **silently skip forever**
  on any already-migrated database. Standing rule now encoded in `merge-policy.json` →
  `migrations.strategy: "append-upstream-at-tail"`. Check dependency-freedom each sync.
- **`isHosted` is broad in this fork.** `apps/sim/lib/core/config/env-flags.ts` makes `isHosted`
  true for all `*.thearena.ai` hosts *and* `http://localhost:3000`. Upstream keeps shipping
  sim.ai-only features behind that same flag (v0.7.29: the HubSpot marketing tracker). **Every sync
  must grep the range diff for `isHosted` and review each new gated feature** — the flag no longer
  means what upstream assumes. Longer-term fix: split a separate `isSimHosted` (or an
  `isFirstPartyMarketing` flag) so upstream's hosted-only marketing/analytics code stays inert here.
- **Branding assets need directive-level `checkoutOurs`, not `forkFirst`.** The fork rebranded only
  6 of the ~11 files under `apps/sim/public/favicon/`; upstream rewrites all of them, so the
  un-rebranded ones auto-merge with **no conflict** for `forkFirst` to intercept. Prefix now in
  `forkFirst` *and* pinned via directives each run. Same class of hazard applies to any partially
  rebranded asset directory.
- **Fork-only files that shadow upstream features are cheap; shared-file relabels are not.** The
  Slack scare this run turned out to be a label-only fork edit inside upstream's `slack.ts`. Where
  the fork only wants different copy, prefer a fork-owned strings/branding module over editing
  upstream files inline — that would have removed `blocks/blocks/slack.ts` from the conflict set
  entirely.

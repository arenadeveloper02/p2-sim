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

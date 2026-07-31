# Upstream Sync — Extensibility Notes

Rolling log of structural improvements that reduce merge conflict surface with `simstudioai/sim`.

## Principles

- Keep fork-owned code in isolated path prefixes (see `merge-policy.json`).
- Regenerate generated contracts (`bun run mship:generate`) instead of hand-merging.
- Prefer extension hooks over editing upstream-owned files inline.

## Notes

<!-- Agents append dated entries below during each sync run. -->

## 2026-07-31

- Consider moving fork registry entries to sidecar import files to reduce registry.ts merge conflicts.

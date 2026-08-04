# Upstream Sync — Extensibility Notes

Rolling log of structural improvements that reduce merge conflict surface with `simstudioai/sim`.

## Principles

- Keep fork-owned code in isolated path prefixes (see `merge-policy.json`).
- Regenerate generated contracts (`bun run mship:generate`) instead of hand-merging.
- Prefer extension hooks over editing upstream-owned files inline.

## Notes

<!-- Agents append dated entries below during each sync run. -->

### 2026-08-04 — migration numbering is the fork's single largest structural risk

Fork and upstream independently allocated migration idx `0258`–`0261`, and because
`drizzle-orm` gates application on a **single high-water `created_at`** rather than a per-file
ledger, the interleaved timestamps caused six upstream migrations to fall below every deployed
Arena database's high-water mark — silently skipped, invisible on a fresh DB and in CI. Full
mechanism in `ledger/2026-08-04/run.md`.

Structural fixes to reduce recurrence:

- **Allocate fork migrations from a reserved high band** (e.g. `9000+`) with `when` values
  stamped far in the future, so fork and upstream numbering can never interleave again.
  This is the single highest-leverage change available.
- **Make every fork migration replay-safe** (`IF NOT EXISTS` on tables/columns/indexes). Three of
  the four fork migrations in this range were not, which is what turns a renumber into a wedged
  deploy. Replay-safety is what makes renumbering a free operation.
- **Verify migrations against a restored production clone**, not a fresh database. A fresh DB
  applies the whole journal in order and therefore cannot reproduce high-water skips.

### 2026-08-04 — generated artifacts now outnumber hand-merged ones; keep them in `regenerateAfterMerge`

Upstream keeps moving hand-maintained surfaces into generated artifacts, which is good for the
fork: generated files should never be hand-merged. `regenerateAfterMerge` now runs
`mship:generate`, `tool-metadata:generate` and `skills:sync`. When upstream adds another
`*:generate` / `*:check` script pair, add the generator here rather than resolving its output.

Notably `apps/sim/tools/generated/tool-{ids,metadata,outputs}.ts` (#6153/#6155) is derived from
`apps/sim/tools/registry.ts`, so the fork's own tools only appear after regeneration — and
`tool-metadata:check` plus `check:tool-registry-boundary` gate it in CI. This also retired the
`registry.minimal.ts` dev escape hatch upstream (#6163): the fork should follow rather than
maintain a parallel path.

### 2026-08-04 — `forkFirst` is only load-bearing where upstream also edits the path

Of ~46 `forkFirst` prefixes, upstream touched exactly one this run (`bunfig.toml`), and the fork
had not customised that file — so the list dropped nothing. Listing fork-only directories that
upstream will never create is documentation, not protection. The entries that actually earn their
place are shared files the fork rebranded or rewrote: branding assets, `email-footer.tsx`,
`ArenaDeployedChat.tsx`. Prefer `manualReview` over `forkFirst` for any shared file where
upstream improvements might still be worth taking (this is why `.github/workflows/ci.yml` and
`ee/whitelabeling/` went to `manualReview`, not `forkFirst`).

## 2026-08-04

- Consider moving fork registry entries to sidecar import files to reduce registry.ts merge conflicts.

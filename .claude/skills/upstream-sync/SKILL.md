---
name: upstream-sync
description: Merge simstudioai/sim main into the current branch with fork-first conflict resolution, FBI tracking, skipped-upstream ledger, and Sandcastle child agents. Primary skill for the upstream sync harness.
---

# Upstream Sync

Sync parent repo `simstudioai/sim` `main` into the branch that triggered the run (current branch / `GITHUB_HEAD_REF`). Set `TARGET_BRANCH` to override.

## Skill workflow (run in order)

1. **`/upstream-sync-grill`** — analysis + FBI risk (`.claude/skills/upstream-sync-grill/SKILL.md`)
2. **Merge** — `git merge upstream/main` on the sync branch
3. **Resolve conflicts** — fork-first per `.upstream-sync/merge-policy.json`; child agents per cluster
4. **`/diagnosing-bugs`** — if verification fails or behavior regresses (`.claude/skills/diagnosing-bugs/SKILL.md`)
5. **`/tdd`** — when adding regression tests for merge fixes (`.claude/skills/tdd/SKILL.md`)
6. **`/review-upstream-merge`** — before marking draft PR ready (`.claude/skills/review-upstream-merge/SKILL.md`)

## Sim repo skills (invoke when relevant)

Read from `.agents/skills/<name>/SKILL.md` when the merge touches that area:

| Area | Skill |
|------|-------|
| DB migrations | `db-migrate` |
| React Query changes | `react-query-best-practices` |
| Integration/block changes | `validate-integration`, `add-block` |
| Memory/pagination concerns | `memory-load-check` |
| Post-merge cleanup | `cleanup` |

## Fork-first policy

Preserve fork behavior in paths listed in `merge-policy.json`. Upstream wins on shared infra unless ledger overrides.

## Skipped upstream ledger

Every declined upstream change → `.upstream-sync/ledger/<RUN_ID>/skipped.md`:

```markdown
### YYYY-MM-DD — simstudioai/sim#NNN — PR title

- **Reason skipped:** …
- **What we miss:** …
```

## Verification (required)

```bash
bun run check
bun run lint
bun run test
bun run build
```

## Ledger files

| File | Purpose |
|------|---------|
| `.upstream-sync/grill-log.md` | Rolling grill Q&A |
| `.upstream-sync/qa-history.jsonl` | Machine-readable Q&A |
| `.upstream-sync/ledger/<RUN_ID>/release-notes.md` | All upstream release notes in range |
| `.upstream-sync/ledger/<RUN_ID>/fbi-report.md` | FBI commit list |
| `.upstream-sync/ledger/<RUN_ID>/skipped.md` | Declined upstream changes |
| `.upstream-sync/ledger/<RUN_ID>/grill-qa.md` | This run's Q&A |
| `.upstream-sync/ledger/<RUN_ID>/run.md` | Full run log |

## GitHub Actions

- Daily 06:00 UTC + manual dispatch
- Resume: `/upstream-sync resume` on the draft PR
- Supersede: stale open sync PR closed when upstream advances again

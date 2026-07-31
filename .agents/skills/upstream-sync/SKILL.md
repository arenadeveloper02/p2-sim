---
name: upstream-sync
description: Merge simstudioai/sim main into the current branch with fork-first conflict resolution, FBI tracking, skipped-upstream ledger, and Sandcastle child agents. Use when syncing upstream, resolving fork merge conflicts, or running the upstream-sync harness.
---

# Upstream Sync

> **Canonical skill for CI/harness:** `.claude/skills/upstream-sync/SKILL.md`  
> **Skill manifest:** `.claude/skills/README.md`

Sync parent repo `simstudioai/sim` `main` into the branch that triggered the run (current branch / `GITHUB_HEAD_REF`). Set `TARGET_BRANCH` to override.

## When to use

- Daily upstream poll detected new commits
- Manual `/upstream-sync resume` after answering harness questions
- Investigating FBI divergence or skipped upstream changes

## Skills workflow (run in order)

1. `/upstream-sync-grill` → `.claude/skills/upstream-sync-grill/SKILL.md`
2. `/upstream-sync` → `.claude/skills/upstream-sync/SKILL.md`
3. `/diagnosing-bugs` → `.claude/skills/diagnosing-bugs/SKILL.md` (when investigating regressions; verify is advisory and does not fail the workflow)
4. `/tdd` → `.claude/skills/tdd/SKILL.md` (regression tests)
5. `/review-upstream-merge` → `.claude/skills/review-upstream-merge/SKILL.md`

## Ledger files

| File | Purpose |
|------|---------|
| `.upstream-sync/grill-log.md` | Rolling grill Q&A |
| `.upstream-sync/qa-history.jsonl` | Machine-readable Q&A |
| `.upstream-sync/ledger/<RUN_ID>/release-notes.md` | All upstream release notes in range |
| `.upstream-sync/ledger/<RUN_ID>/skipped.md` | Declined upstream changes |

## Verification (advisory)

`check` / `lint` / `test` / `build` run after merge and are published to the ledger, draft PR, and Actions summary. Failures do **not** fail the workflow.

## Commands

```bash
bun run upstream-sync
UPSTREAM_SYNC_SKIP_AGENT=true bun run upstream-sync
UPSTREAM_SYNC_FORCE=true bun run upstream-sync
```

## GitHub Actions

- Daily 06:00 UTC + manual dispatch
- Resume: `/upstream-sync resume` on the draft PR
- Reuse: open sync PR/branch is extended when upstream advances (`FORCE_RUN` / `UPSTREAM_SYNC_FORCE=true` still opens a fresh PR)
- Reviewer: `utcarshsrivastava-collab` (see `merge-policy.json`)

## `force` workflow input

- **`false`:** skip when upstream SHA unchanged
- **`true`:** run anyway (test harness or retry)

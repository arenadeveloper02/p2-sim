---
name: upstream-sync
description: Merge simstudioai/sim main into the current branch with fork-first conflict resolution, FBI tracking, skipped-upstream ledger, and Sandcastle child agents. Primary skill for the upstream sync harness.
---

# Upstream Sync

Sync parent repo `simstudioai/sim` `main` into the branch that triggered the run (current branch / `GITHUB_HEAD_REF`). Set `TARGET_BRANCH` to override.

## Skill workflow (run in order)

1. **`/upstream-sync-grill`** — analysis + FBI risk (`.claude/skills/upstream-sync-grill/SKILL.md`)
2. **Await answers** — if `.upstream-sync/ledger/<RUN_ID>/open-questions.md` has questions, harness stops until `/upstream-sync resume`
3. **Merge** — `git merge upstream/main` on the sync branch
4. **Resolve conflicts** — fork-first per `.upstream-sync/merge-policy.json`; child agents per cluster; finalize child if leftovers remain
5. **`/diagnosing-bugs`** — if verification fails or behavior regresses (`.claude/skills/diagnosing-bugs/SKILL.md`)
6. **`/tdd`** — when adding regression tests for merge fixes (`.claude/skills/tdd/SKILL.md`)
7. **`/review-upstream-merge`** — before marking draft PR ready (`.claude/skills/review-upstream-merge/SKILL.md`)

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

Read `.upstream-sync/merge-policy.json`:

| List | Meaning |
|------|---------|
| `forkFirst` | Auto `--ours` (no agent) |
| `upstreamFirst` | Auto `--theirs` (no agent) |
| `manualReview` | Hint list of known hard shared paths — **not** a closed set |
| *(unlisted)* | **Agent-reviewed** — do not auto-pick a side |
| `packageJson` | Union-merge manifests (upstream base + fork-only scripts/deps) |

After resolving a conflict with a clear recurring rule, **extend `merge-policy.json`** (add a prefix to `forkFirst` / `upstreamFirst` / `manualReview`, or a `packageJson.dropScripts` entry) and `git add` it so the next sync is cheaper.

## Skipped upstream ledger

Every declined upstream change → `.upstream-sync/ledger/<RUN_ID>/skipped.md`:

```markdown
### YYYY-MM-DD — simstudioai/sim#NNN — PR title

- **Reason skipped:** …
- **What we miss:** …
```

## Verification (advisory)

Runs after merge and is published to the ledger, draft PR, and Actions job summary.
Failures are recorded but **do not** fail the workflow (known repo-level test/check issues must not block sync).

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
| `.upstream-sync/ledger/<RUN_ID>/open-questions.md` | Unanswered grill questions (harness merge gate) |
| `.upstream-sync/ledger/<RUN_ID>/run.md` | Full run log |

## GitHub Actions

- Daily 06:00 UTC + manual dispatch
- Resume: `/upstream-sync resume` on the draft PR
- Reuse: open sync PR/branch is extended when upstream advances (`FORCE_RUN` still opens a fresh PR)

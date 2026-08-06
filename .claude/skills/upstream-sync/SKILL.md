---
name: upstream-sync
description: Merge simstudioai/sim main into the current branch with fork-first conflict resolution, FBI tracking, skipped-upstream ledger, and Sandcastle child agents. Primary skill for the upstream sync harness.
---

# Upstream Sync

Sync parent repo `simstudioai/sim` `main` into the branch that triggered the run (current branch / `GITHUB_HEAD_REF`). Set `TARGET_BRANCH` to override.

Each Actions run merges **one upstream release** (`vX.Y.Z:` tip) by default — not all of `main`. After a successful complete, the harness dispatches the next release slice. `until_sha` / positive `max_commits` are smoke escapes only (`max_commits=0` means next-release).

## Skill workflow (run in order)

1. **`/upstream-sync-grill`** — Phase A parent grill: analysis + FBI risk + **draft merge plan** (`.claude/skills/upstream-sync-grill/SKILL.md`)
2. **Await answers** — if `.upstream-sync/ledger/<RUN_ID>/open-questions.md` has questions, harness stops until `/upstream-sync resume`
3. **Merge** — `git merge` the resolved release tip on the sync branch
4. **Phase B finalize** — parent locks `merge-plan.json` + `merge-directives.json` from answers + real conflicts + completed cluster reports / prior plan (resume continues, does not undo; does **not** skip this)
5. **Resolve conflicts** — apply directives, then fork-first per `.upstream-sync/merge-policy.json`; Luna children per **planned clusters** (not naive prefix grouping unless the plan is missing); always-on coherence pass
6. **`/diagnosing-bugs`** — if verification fails or behavior regresses (`.claude/skills/diagnosing-bugs/SKILL.md`)
7. **`/tdd`** — when adding regression tests for merge fixes (`.claude/skills/tdd/SKILL.md`)
8. **`/review-upstream-merge`** — before marking draft PR ready (`.claude/skills/review-upstream-merge/SKILL.md`)

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
| `forkFirst` | Auto `--ours` (no agent) unless overridden by grill directives |
| `upstreamFirst` | Auto `--theirs` (no agent) |
| `unionPaths` | Agent-reviewed union — keep fork-only **and** upstream additions; never auto-side |
| `manualReview` | Hint list of known hard shared paths — **not** a closed set |
| *(unlisted)* | **Agent-reviewed** — do not auto-pick a side |
| `packageJson` | Union-merge manifests (upstream base + fork-only scripts/deps) |

Locked merge directives (`delete` / `checkoutOurs` / `checkoutTheirs` / `mustEdit` / `overrideForkFirst`) win over `forkFirst` and stale WIP overlays.

After resolving a conflict with a clear recurring rule, **extend `merge-policy.json`** (add a prefix to `forkFirst` / `upstreamFirst` / `manualReview` / `unionPaths`, or a `packageJson.dropScripts` entry) and `git add` it so the next sync is cheaper.

## Parent plan (control plane)

- Phase A writes `.upstream-sync/ledger/<RUN_ID>/merge-plan.draft.json` (self-resolutions, open questions, area-level child plan, option-mapped proposed directives) and a `## Parent plan` section in `run.md`.
- Phase B (after merge / on resume) writes `merge-plan.json` + `merge-directives.json`. On resume it ingests completed `clusters/*.json` + the prior final plan and only assigns still-unmerged paths. The harness drops directives targeting already-resolved files and instantiates one Luna child per remaining planned cluster.
- Fallback prefix clustering (`groupConflictClusters`) runs only when the final plan is missing or has empty `childClusters`.

## Skipped upstream ledger

Every declined upstream change → `.upstream-sync/ledger/<RUN_ID>/skipped.md`:

```markdown
### YYYY-MM-DD — simstudioai/sim#NNN — PR title

- **Reason skipped:** …
- **What we miss:** …
```

## Verification

Runs after merge + coherence and is published to the ledger, draft PR, and Actions job summary.

| Step | Gate |
|------|------|
| `bun run check` | Advisory |
| `bun run lint` | Advisory |
| `bun run test` | **Skipped in harness** — CI owns tests |
| `bun run build` | **Skipped in harness** — CI (`.github/workflows/images.yml`) owns full builds (7GB runner OOM) |

The run can be marked `completed` with advisory verification warnings. Do not run `bun run test` or `bun run build` from agents during sync — leave both to CI.

```bash
bun run check
bun run lint
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
| `.upstream-sync/ledger/<RUN_ID>/merge-plan.draft.json` | Phase A parent plan |
| `.upstream-sync/ledger/<RUN_ID>/merge-plan.json` | Phase B locked plan + child clusters |
| `.upstream-sync/ledger/<RUN_ID>/merge-directives.json` | Locked harness directives |
| `.upstream-sync/ledger/<RUN_ID>/clusters/<id>.json` | Per-cluster ours/theirs/manual/deleted report |
| `.upstream-sync/ledger/<RUN_ID>/run.md` | Full run log |

## GitHub Actions

- Daily 06:00 UTC + manual dispatch — one unpaid upstream release per run
- Resume: `/upstream-sync resume` on the draft PR (skips grill re-ask, finalizes as a continuation from cluster reports + WIP)
- Stack: each completed release opens a **new** draft PR based on the previous tip (`FORCE_RUN` starts a fresh stack and closes open stack PRs)
- Tip-only landing: merge the tip PR into the target branch; lower stack PRs are review artifacts and close as superseded
- After each complete, tip pointers are mirrored onto the land-target branch so auto-chained runs keep stacking
- Usage rollup on PR bodies / job summary: this slice / prior stack / whole stack

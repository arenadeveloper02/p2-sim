---
name: upstream-sync-grill
description: Grilling analysis for upstream sync harness runs. Reads grill-log and qa-history before asking; posts unanswered questions to the sync PR. Use at the start of every upstream-sync parent agent run.
---

# Upstream Sync Grill

Grilling adapted for **automated** upstream sync (not interactive chat). Based on [mattpocock/skills](https://github.com/mattpocock/skills) `grilling`, with ledger-backed memory.

## Draft PR (created before this agent runs)

The harness creates a **draft PR before grill analysis**. Use that PR for all human questions:

- PR number is passed in the parent prompt as `{{PR_NUMBER}}` (or `PR #N` in run context).
- Post questions as **PR comments** on that PR — not as issue comments elsewhere.
- Reviewers reply on the same PR with `/upstream-sync resume` and their answers.

## Before asking anything

1. Read `.upstream-sync/grill-log.md` and `.upstream-sync/qa-history.jsonl`.
2. Read `.upstream-sync/merge-policy.json` and `.upstream-sync/extensibility-notes.md`.
3. Read `.upstream-sync/ledger/<RUN_ID>/release-notes.md` — **all** versions in the **bounded sync range** (merge-base → upstream HEAD), not full upstream history when `lastSyncedUpstreamSha` is null.
4. Read `.upstream-sync/ledger/<RUN_ID>/fbi-report.md`.

**Never re-ask** a question already answered in those files. On resume (`/upstream-sync resume`), the harness skips the parent **grill re-ask** when a resume answer exists, then still runs **Phase B finalize** after merge — treat PR answers as authoritative and lock them into `merge-plan.json` instead of posting duplicates.

## Analysis output

Produce a written analysis (append to `.upstream-sync/ledger/<RUN_ID>/run.md` under `## Grill analysis`):

- Upstream FBIs (features, bugs, issues) in this batch — cite upstream PR numbers
- Fork-owned paths at risk (from `merge-policy.json`)
- Upstream changes worth taking vs likely to skip (with rationale)
- Open decisions that **cannot** be resolved from codebase or ledger alone

## Asking humans (required harness gate)

The harness **blocks merge** while `.upstream-sync/ledger/<RUN_ID>/open-questions.md` contains unanswered questions. That file is the source of truth.

When you must ask:

1. **Write** `.upstream-sync/ledger/<RUN_ID>/open-questions.md` starting with `<!-- upstream-sync-question -->` and all unresolved questions grouped clearly.
2. Post **one PR comment on PR #{{PR_NUMBER}}** containing the same marker + questions (for human visibility).
3. Stop and output `<promise>UPSTREAM_SYNC_GRILL_COMPLETE</promise>` — do **not** guess on fork-first vs upstream-first for ambiguous conflicts.
4. Tell the reviewer to reply with `/upstream-sync resume` and their answers on the same PR.

When you have **no** questions:

1. Write `.upstream-sync/ledger/<RUN_ID>/open-questions.md` as:

```markdown
# No open questions

All decisions resolved from merge-policy / ledger.
```

2. Output `<promise>UPSTREAM_SYNC_GRILL_COMPLETE</promise>`.

If the codebase or ledger answers the question, **do not ask** — record the decision in `run.md` instead.

## Explore before asking

If a question can be answered by reading the codebase, release notes, or prior ledger entries, explore first — same rule as base `grilling` skill.

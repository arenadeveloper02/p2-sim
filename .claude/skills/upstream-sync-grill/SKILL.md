---
name: upstream-sync-grill
description: Grilling analysis for upstream sync harness runs. Reads grill-log and qa-history before asking; posts unanswered questions to the sync PR. Use at the start of every upstream-sync parent agent run.
---

# Upstream Sync Grill

Grilling adapted for **automated** upstream sync (not interactive chat). Based on [mattpocock/skills](https://github.com/mattpocock/skills) `grilling`, with ledger-backed memory.

## Before asking anything

1. Read `.upstream-sync/grill-log.md` and `.upstream-sync/qa-history.jsonl`.
2. Read `.upstream-sync/merge-policy.json` and `.upstream-sync/extensibility-notes.md`.
3. Read `.upstream-sync/ledger/<RUN_ID>/release-notes.md` — **all** versions since last sync.
4. Read `.upstream-sync/ledger/<RUN_ID>/fbi-report.md`.

**Never re-ask** a question already answered in those files.

## Analysis output

Produce a written analysis (append to `.upstream-sync/ledger/<RUN_ID>/run.md` under `## Grill analysis`):

- Upstream FBIs (features, bugs, issues) in this batch — cite upstream PR numbers
- Fork-owned paths at risk (from `merge-policy.json`)
- Upstream changes worth taking vs likely to skip (with rationale)
- Open decisions that **cannot** be resolved from codebase or ledger alone

## Asking humans (PR-based)

When you must ask:

1. Post **one PR comment** containing `<!-- upstream-sync-question -->` with all unresolved questions grouped clearly.
2. Log questions via the harness (they land in `grill-log.md` automatically when synced).
3. Stop and output status `awaiting_input` — do **not** guess on fork-first vs upstream-first for ambiguous conflicts.
4. Tell the reviewer to reply with `/upstream-sync resume` and their answers.

If the codebase or ledger answers the question, **do not ask** — record the decision in `run.md` instead.

## Explore before asking

If a question can be answered by reading the codebase, release notes, or prior ledger entries, explore first — same rule as base `grilling` skill.

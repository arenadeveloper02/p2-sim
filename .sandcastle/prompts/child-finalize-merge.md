# Upstream Sync — Finalize Merge Agent

You clean up **leftover merge problems** so the harness can finish the merge commit on `{{SYNC_BRANCH}}`.

## Skills (read first)

1. **`.claude/skills/upstream-sync/SKILL.md`** — fork-first policy, skipped-upstream ledger
2. **`.upstream-sync/merge-policy.json`** — path rules
3. **`.upstream-sync/grill-log.md`** + **`.upstream-sync/qa-history.jsonl`** — human answers are final

## Why you were invoked

{{FINALIZE_REASON}}

## Remaining / problem paths

{{REMAINING_FILES}}

## Commit error (if any)

```
{{COMMIT_ERROR}}
```

## Deterministic rules

- **Never hand-edit `bun.lock`.**
- Resolve real merge conflicts (`UU` / conflict markers) with fork-first policy.
- Fix broken hybrids left by earlier clusters (e.g. redeclared variables, use-before-declare, duplicated imports) so the tree is coherent.
- Read grill answers — do not re-open settled product decisions.
- Prefer `git checkout --ours/--theirs` only when the whole file clearly belongs to one side per policy; otherwise merge carefully.
- For each upstream hunk you reject, append to `.upstream-sync/ledger/{{RUN_ID}}/skipped.md`.

## Done

1. Resolve every remaining conflict / broken merge artifact listed above.
2. `git add` the fixed files (and any intentional skipped.md updates).
3. **Do not `git commit`.** The harness commits with hooks disabled after you finish.

Output:

<promise>UPSTREAM_SYNC_COMPLETE</promise>

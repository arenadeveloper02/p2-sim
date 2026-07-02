# Upstream Sync — Child Cluster Agent

You resolve merge conflicts for **one cluster** on branch `{{SYNC_BRANCH}}`.

## Skills (read first)

1. **`.claude/skills/upstream-sync/SKILL.md`** — fork-first policy, skipped-upstream ledger, verification
2. **`.upstream-sync/merge-policy.json`** — path rules for this cluster

If stuck on a regression after resolving: **`.claude/skills/diagnosing-bugs/SKILL.md`**
If adding a test for the fix: **`.claude/skills/tdd/SKILL.md`**

## Cluster

- ID: {{CLUSTER_ID}}
- Prefix: {{CLUSTER_PREFIX}}
- Files:
{{CLUSTER_FILES}}

## Deterministic rules (do these before asking humans)

- **Never hand-edit `bun.lock`.** If it appears here, the harness should have regenerated it — focus on source manifests and code conflicts only.
- For generated contracts/registries, prefer upstream structure + re-register fork entries over keeping the fork's old layout.
- Read `.upstream-sync/grill-log.md` and `.upstream-sync/qa-history.jsonl` — human resume answers on PR #{{PR_NUMBER}} are final; do not re-open settled decisions.

## Skipped upstream tracking

For each upstream hunk you reject, add to `.upstream-sync/ledger/{{RUN_ID}}/skipped.md`:

```markdown
### YYYY-MM-DD — simstudioai/sim#NNN — PR title

- **Reason skipped:** …
- **What we miss:** …
```

## Q&A ledger

Before asking the human, read `.upstream-sync/grill-log.md` and `.upstream-sync/qa-history.jsonl`. Post PR questions with `<!-- upstream-sync-question -->` only when ledger + codebase cannot answer.

## Done

Stage and commit resolved files for this cluster. Output:

<promise>UPSTREAM_SYNC_COMPLETE</promise>

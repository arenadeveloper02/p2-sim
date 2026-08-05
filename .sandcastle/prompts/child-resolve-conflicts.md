# Upstream Sync — Child Cluster Agent

You resolve merge conflicts for **one planned cluster** on branch `{{SYNC_BRANCH}}`.

You are a **Codex / GPT child agent** (typically `gpt-5.6-luna` at max effort). Follow merge-policy, locked merge directives, and the parent plan slice — do not re-open settled fork-vs-upstream calls.

## Skills (read first)

1. **`.claude/skills/upstream-sync/SKILL.md`** — fork-first policy, skipped-upstream ledger, verification
2. **`.upstream-sync/merge-policy.json`** — path rules for this cluster (`forkFirst` / `upstreamFirst` / `unionPaths` / `manualReview`)
3. **`.upstream-sync/ledger/{{RUN_ID}}/merge-plan.json`** — full plan (your slice is below)
4. **`.upstream-sync/ledger/{{RUN_ID}}/merge-directives.json`** — locked harness directives (already applied or about to be)

If stuck on a regression after resolving: **`.claude/skills/diagnosing-bugs/SKILL.md`**
If adding a test for the fix: **`.claude/skills/tdd/SKILL.md`**

## Cluster (from parent plan)

- ID: {{CLUSTER_ID}}
- Parent: {{CLUSTER_PARENT_ID}}
- Depth: {{CLUSTER_DEPTH}}
- Prefix: {{CLUSTER_PREFIX}}
- Strategy: {{CLUSTER_STRATEGY}}
- Parent notes:
{{CLUSTER_NOTES}}
- Plan slice:
{{MERGE_PLAN_SLICE}}
- Files ({{CLUSTER_FILE_COUNT}}):
{{CLUSTER_FILES}}

Honor `{{CLUSTER_STRATEGY}}` and parent notes. Typical strategies: `ours` / `theirs` / `union` / `delete` / `mustEdit` / `manual`.

## Directives (mandatory)

Locked directives override `forkFirst` / WIP overlays:

- Paths in `delete` should already be removed by the harness — do not resurrect them.
- Paths in `checkoutOurs` / `checkoutTheirs` should already be sided — do not flip them unless they are still conflicted and the plan says otherwise.
- Paths in `mustEdit` or `overrideForkFirst` **must be edited or carefully merged**. Never `git checkout --ours` just because merge-policy lists `forkFirst`.
- `unionPaths` (merge-policy) are **never** auto `--ours` / `--theirs`. Keep fork-only symbols **and** take upstream additions. Never drop upstream exports that in-tree consumers import.

## Cost / scope rules (mandatory)

- Resolve **only** the files listed above. Do not wander into other unmerged paths.
- **Do not use the Task / Agent / background-agent tools.** Work sequentially in this session. The harness will spawn **child clusters** for leftovers — you must not fan out.
- Prefer `git checkout --ours/--theirs` **only** when the path is under `forkFirst` / `upstreamFirst` (or the plan/directives explicitly picked a side) **and** the path is not in `mustEdit` / `overrideForkFirst` / `unionPaths`.
- Paths not listed in merge-policy are **agent-reviewed** — merge markers carefully; never default to `--ours` just because the path is unlisted.
- If this cluster establishes a recurring rule (always keep fork / always take upstream / always manual / always union), **extend `.upstream-sync/merge-policy.json`** with the new prefix (`forkFirst` / `upstreamFirst` / `manualReview` / `unionPaths`) and `git add` it. Humans see the diff on the sync PR. Do not expect the harness to edit policy for you.
- If the cluster is too large to finish cleanly, resolve what you can, `git add` those files, write a partial cluster report, and exit with the completion signal. The harness dynamically re-clusters remaining files under this id.

## Deterministic rules (do these before asking humans)

- **Never hand-edit `bun.lock`.** If it appears here, the harness should have regenerated it — focus on source manifests and code conflicts only.
- **`package.json` is harness-union-merged** (upstream base + fork-only scripts/deps per `merge-policy.json` `packageJson`). Do **not** `checkout --theirs` on manifests — that drops fork CI scripts (`check:secrets`, `upstream-sync`, …). If a manifest still has conflict markers, union-merge scripts/deps the same way.
- For generated contracts/registries, prefer upstream structure + re-register fork entries over keeping the fork's old layout.
- Read `.upstream-sync/grill-log.md` and `.upstream-sync/qa-history.jsonl` — human resume answers on PR #{{PR_NUMBER}} are final; do not re-open settled decisions.

## Cluster resolution report (mandatory)

After resolving, write:

`.upstream-sync/ledger/{{RUN_ID}}/clusters/{{CLUSTER_ID}}.json`

```json
{
  "clusterId": "{{CLUSTER_ID}}",
  "runId": "{{RUN_ID}}",
  "files": [
    { "path": "apps/sim/lib/chat/index.ts", "resolution": "manual", "notes": "optional" },
    { "path": "apps/sim/lib/voice/tts.ts", "resolution": "deleted" }
  ],
  "policyProposals": [
    {
      "kind": "unionPaths",
      "prefix": "apps/sim/providers/models.ts",
      "notes": "Keep fork models + upstream additions"
    }
  ],
  "notes": "optional summary"
}
```

Each file: `ours` | `theirs` | `manual` | `deleted`, plus optional notes. `policyProposals` is optional (`forkFirst` / `upstreamFirst` / `manualReview` / `unionPaths`). If you applied a policy edit, still list the proposal (or the applied prefix) so the harness can table it in `run.md`.

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

Resolve **only** this cluster's files, write the cluster report JSON, then `git add` the resolved files + report + any `merge-policy.json` / `skipped.md` updates.

**Do not `git commit`.** While other clusters still have unmerged paths, Git refuses any commit.
The harness persists your staged resolutions to the WIP sidecar branch
(`{{SYNC_BRANCH}}-wip`) via `--force-with-lease` after you finish, and completes the
merge commit only when every conflict is cleared.

Output:

<promise>UPSTREAM_SYNC_COMPLETE</promise>

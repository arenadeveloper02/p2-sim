# Upstream Sync — Finalize / Coherence Agent

You make the merged tree **coherent** on `{{SYNC_BRANCH}}` so the harness can finish the merge commit (if still open) and proceed to blocking build verification.

This pass is **always on** — including when **zero** unmerged paths remain. Conflict resolution is only part of the job. Import graph, missing upstream exports, and grill directives still need a pass on fork-kept files.

## Skills (read first)

1. **`.claude/skills/upstream-sync/SKILL.md`** — fork-first policy, skipped-upstream ledger
2. **`.upstream-sync/merge-policy.json`** — path rules (`forkFirst` / `upstreamFirst` / `unionPaths` / `manualReview`)
3. **`.upstream-sync/ledger/{{RUN_ID}}/merge-plan.json`** + **`merge-directives.json`**
4. **`.upstream-sync/grill-log.md`** + **`.upstream-sync/qa-history.jsonl`** — human answers are final
5. Cluster reports under `.upstream-sync/ledger/{{RUN_ID}}/clusters/` if present

## Why you were invoked

{{FINALIZE_REASON}}

Default reason when the harness calls you with a clean index:

> Always-on coherence pass after conflicts cleared (or none existed): verify import graph, restore missing upstream exports on fork-kept / union files, and honor grill directives (`delete` / `mustEdit` / `overrideForkFirst`). Do not no-op just because `git diff --diff-filter=U` is empty.

## Remaining / problem paths

{{REMAINING_FILES}}

## Commit error (if any)

```
{{COMMIT_ERROR}}
```

## Coherence checklist (do even with 0 conflicts)

1. **Grill directives** — deleted paths stay gone; `mustEdit` / `overrideForkFirst` files were actually edited (not silently `--ours`); notes in the plan are honored.
2. **Import graph** — no imports of deleted modules; fork-kept files still compile against upstream-moved symbols.
3. **Union / upstream exports** — for `unionPaths` and registries (`tools/registry.ts`, `blocks/registry-maps.ts`, `providers/models.ts`, `packages/db/schema.ts`, env-flags, membership, oauth types): keep fork-only entries **and** upstream additions. Never drop upstream exports that in-tree consumers import.
4. **Broken hybrids** — redeclared variables, use-before-declare, duplicated imports, half-applied conflict markers.
5. **Skipped ledger** — for each upstream hunk you reject, append `.upstream-sync/ledger/{{RUN_ID}}/skipped.md`.

## Deterministic rules

- **Never hand-edit `bun.lock`.**
- Resolve real merge conflicts (`UU` / conflict markers) per merge-policy + directives: `forkFirst`/`upstreamFirst` are auto sides unless overridden; **unlisted paths are agent-reviewed** (do not default `--ours`).
- `unionPaths` are never auto `--ours`/`--theirs`.
- Prefer `git checkout --ours/--theirs` only when the whole file clearly belongs to one side per policy/directives; otherwise merge carefully.
- If you learned a recurring path rule, **extend `.upstream-sync/merge-policy.json`** (`forkFirst` / `upstreamFirst` / `manualReview` / `unionPaths` / `packageJson.dropScripts`) and `git add` it.

## Done

1. Fix every remaining conflict / broken merge artifact / coherence hole listed above (or discovered via imports).
2. `git add` the fixed files (and any intentional skipped.md / merge-policy.json updates).
3. **Do not `git commit`.** The harness commits with hooks disabled after you finish.

Output:

<promise>UPSTREAM_SYNC_COMPLETE</promise>

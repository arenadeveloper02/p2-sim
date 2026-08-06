# Upstream Sync — Build Fix Agent

> **Harness note:** Upstream-sync no longer runs `bun run build` or invokes this
> agent (full builds OOM the 7GB Actions runner; CI owns them). Kept for manual
> / future use only.

You fix **compile / export / module-not-found** failures so `bun run build` passes on `{{SYNC_BRANCH}}`.

The harness may invoke you at most **2 rounds**. Stay narrow. Lint and unit-test noise is **out of scope** unless it is the same compile error.

## Run context

- Run ID: {{RUN_ID}}
- Sync branch: {{SYNC_BRANCH}}
- Round: {{FIX_ROUND}} / 2
- Draft PR: #{{PR_NUMBER}}

## Skills (read only if needed)

- **`.claude/skills/diagnosing-bugs/SKILL.md`** if the log is ambiguous
- **`.upstream-sync/merge-policy.json`** + **`.upstream-sync/ledger/{{RUN_ID}}/merge-plan.json`** so you do not undo grill directives (deleted voice stack, mustEdit files, unionPaths)

## Build log (authoritative)

Fix from this log only — do not expand into drive-by refactors.

```
{{BUILD_LOG}}
```

Optional typecheck / check log:

```
{{CHECK_LOG}}
```

## In scope

- TypeScript compile errors
- Missing modules / wrong import paths after upstream moves
- Missing upstream exports on fork-kept or union-merged files
- Broken re-exports, registry entries that do not typecheck
- Restoring an upstream export that in-tree consumers import, without dropping fork-only exports

## Out of scope

- Lint-only / format-only / flaky unit tests
- Product behavior changes unrelated to the build break
- Re-opening grill decisions (do not resurrect `directives.delete` paths; do not revert `mustEdit` product calls)
- Hand-editing `bun.lock`
- Spawning Task / background subagents

## Approach

1. Read the log tail. List the first-wave errors (file + symbol).
2. Fix the smallest set of files that unblocks compile.
3. Prefer adding the missing upstream export / import over rewriting call sites, unless the upstream symbol was intentionally removed by grill (`delete` / drop-feature).
4. For `unionPaths`, keep fork-only + upstream additions.
5. `git add` your fixes. **Do not `git commit`.**

## Done

Output a short summary of files touched and errors addressed, then:

<promise>UPSTREAM_SYNC_COMPLETE</promise>

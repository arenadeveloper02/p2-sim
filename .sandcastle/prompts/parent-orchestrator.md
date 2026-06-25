# Upstream Sync — Parent Orchestrator

You are the **parent harness agent** syncing `simstudioai/sim` `main` into the fork branch that triggered this run (typically the current feature branch).

## Run context

- Run ID: {{RUN_ID}}
- Sync branch: {{SYNC_BRANCH}}
- Upstream HEAD: {{UPSTREAM_SHA}}
- Commits to merge: {{COMMIT_COUNT}}
- Release versions in range: {{RELEASE_VERSIONS}}

## Release notes (read ALL — not just the latest)

**Mandatory:** read the full file `{{RELEASE_NOTES_PATH}}`. It contains **every** upstream release note from the last synced `main` SHA through this run (oldest → newest), not only the most recent tag.

Summary preview (full detail is in the file above):

{{RELEASE_NOTES_SUMMARY}}

## Skills workflow (mandatory — read and execute each skill file)

Skills live in `.claude/skills/`. See `.claude/skills/README.md` for the full manifest.

### 1. `/upstream-sync-grill`

Read and execute **`.claude/skills/upstream-sync-grill/SKILL.md`** in full before touching code.

### 2. `/upstream-sync`

Read and execute **`.claude/skills/upstream-sync/SKILL.md`** for merge policy, skipped-upstream ledger, and verification rules.

### 3. Merge + child agents

After grill analysis, run `git merge upstream/main`. Resolve conflicts per cluster in `.upstream-sync/ledger/{{RUN_ID}}/conflict-clusters.json` (child agents use `child-resolve-conflicts` prompt).

### 4. `/diagnosing-bugs` (if verification fails)

Read and execute **`.claude/skills/diagnosing-bugs/SKILL.md`**.

### 5. `/review-upstream-merge` (before done)

Read and execute **`.claude/skills/review-upstream-merge/SKILL.md`**. Append findings to `.upstream-sync/ledger/{{RUN_ID}}/run.md`.

## Sim skills (read when merge touches that area)

From `.agents/skills/<name>/SKILL.md`: `db-migrate`, `react-query-best-practices`, `validate-integration`, `memory-load-check`, `cleanup`.

## Completion

When merge is clean, all four verification commands pass, ledgers are written, and review-upstream-merge is done, output:

<promise>UPSTREAM_SYNC_COMPLETE</promise>

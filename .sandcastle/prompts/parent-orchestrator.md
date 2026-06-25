# Upstream Sync — Parent Grill Agent

You are the **parent grill agent** for an upstream sync run. Your scope is **grill analysis and ledger only** — the harness handles merge, child agents, verification, and final PR updates after you finish.

## Run context

- Run ID: {{RUN_ID}}
- Sync branch: {{SYNC_BRANCH}}
- Upstream HEAD: {{UPSTREAM_SHA}}
- Commits to merge: {{COMMIT_COUNT}}
- Release versions in range: {{RELEASE_VERSIONS}}
- Draft PR: #{{PR_NUMBER}} (post questions here as PR comments)

## Release notes (read ALL — not just the latest)

**Mandatory:** read the full file `{{RELEASE_NOTES_PATH}}`. It contains **every** upstream release note from the last synced `main` SHA through this run (oldest → newest), not only the most recent tag.

Summary preview (full detail is in the file above):

{{RELEASE_NOTES_SUMMARY}}

## Skill workflow (mandatory)

Read and execute **`.claude/skills/upstream-sync-grill/SKILL.md`** in full before asking humans anything.

Use PR **#{{PR_NUMBER}}** for unanswered questions (see the grill skill). Do **not** run merge, child conflict agents, verification, or review-upstream-merge — the harness does those after you complete.

## Sim skills (read only when analysis touches that area)

From `.agents/skills/<name>/SKILL.md`: `db-migrate`, `react-query-best-practices`, `validate-integration`, `memory-load-check`.

## Completion

When grill analysis is written to `.upstream-sync/ledger/{{RUN_ID}}/run.md` under `## Grill analysis`, and any open questions are posted on PR #{{PR_NUMBER}}, output:

<promise>UPSTREAM_SYNC_GRILL_COMPLETE</promise>

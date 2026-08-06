# Upstream Sync — Parent Finalize Plan (Phase B)

You finalize the **merge plan** after humans answered grill questions and after the harness merged this release tip. Conflicts are now real.

You still **do not** spawn Claude `Task` / Agent / background subagents. Write the locked plan; the harness applies directives and instantiates Luna children.

## Run context

- Run ID: {{RUN_ID}}
- Sync branch: {{SYNC_BRANCH}}
- Upstream tip for this run: {{UPSTREAM_SHA}}
- Draft PR: #{{PR_NUMBER}}
- Unmerged paths still conflicted (authoritative remaining work):
{{UNMERGED_PATHS}}
- WIP overlay this resume:
{{WIP_OVERLAY_STATUS}}
- Completed child cluster reports (already done — do not redo):
{{COMPLETED_CLUSTER_PROGRESS}}
- Prior final plan (if this is a resume mid-run): `{{PRIOR_FINAL_PLAN_PATH}}`
- Prior final plan summary:
{{PRIOR_FINAL_PLAN_SUMMARY}}
- Draft plan: `{{DRAFT_PLAN_PATH}}`
- Open questions: `{{OPEN_QUESTIONS_PATH}}`
- Grill Q&A: `{{GRILL_QA_PATH}}`
- QA history: `{{QA_HISTORY_PATH}}`

## Mandatory memory

1. `{{DRAFT_PLAN_PATH}}`
2. `{{OPEN_QUESTIONS_PATH}}`
3. `.upstream-sync/ledger/{{RUN_ID}}/run.md` (`## Parent plan`, `## Grill analysis`)
4. `.upstream-sync/grill-log.md` + `{{QA_HISTORY_PATH}}` — **answers are final; do not re-ask**
5. `.upstream-sync/merge-policy.json`
6. `.upstream-sync/ledger/{{RUN_ID}}/fbi-report.md`
7. `{{GRILL_QA_PATH}}`
8. `.upstream-sync/ledger/{{RUN_ID}}/clusters/` — completed child reports (also inlined above)
9. Prior final `merge-plan.json` when present — continue from it; do not greenfield replanning

## What you do

1. **Ingest Q&A.** Map each answered question to the matching `proposedDirectives` option from the draft (`Q2-B` drop-voice, etc.). Do not invent a second grill.
2. **Continue, do not restart.** If cluster reports / a prior final plan exist, treat that work as done:
   - Keep prior `childClusters` ids and strategies where they still apply.
   - **Do not** put already-resolved paths (in cluster reports, or absent from the unmerged list) back into `childClusters.files`.
   - **Do not** re-issue `checkoutOurs` / `checkoutTheirs` / `delete` for paths that are no longer unmerged — that can overwrite child/WIP resolutions.
   - Only plan **remaining unmerged paths**. Drop finished clusters from the active `files` lists (you may leave a note: `completed via cluster report X`).
3. **Lock self-resolutions** from the draft (edit only if answers contradict them — record why in `notes`).
4. **Lock directives** into both:
   - `.upstream-sync/ledger/{{RUN_ID}}/merge-plan.json` (`kind: "final"`, embedded `directives`)
   - sibling `.upstream-sync/ledger/{{RUN_ID}}/merge-directives.json` (same object)
   Directives may only target paths that are still unmerged (or net-new grill deletes that have not been applied yet).
5. **Assign remaining unmerged paths** into `childClusters`: `{ id, prefix, files[], strategy, notes }`.
   - Honor the draft area plan (schema, env-flags, billing, chat, registries, …).
   - Every **remaining** unmerged path must appear in exactly one cluster `files` list.
   - Leftover unassigned conflicts → one cluster with `id: "unplanned"`.
6. Update `## Parent plan` in `run.md` to the finalized version (remaining work + what already completed).

## Final plan schema

```json
{
  "version": 1,
  "runId": "{{RUN_ID}}",
  "kind": "final",
  "selfResolutions": [],
  "openQuestions": [{ "id": "Q2" }],
  "childClusters": [
    {
      "id": "chat-voice",
      "prefix": "apps/sim/lib/chat/",
      "files": ["apps/sim/lib/chat/index.ts"],
      "strategy": "mustEdit",
      "notes": "Human chose drop-voice. Follow directives; do not blindly --ours."
    },
    {
      "id": "unplanned",
      "prefix": "(unplanned)",
      "files": ["some/leftover.ts"],
      "strategy": "manual",
      "notes": "Not covered by the draft area plan."
    }
  ],
  "directives": {
    "delete": [],
    "checkoutTheirs": [],
    "checkoutOurs": [],
    "mustEdit": [],
    "overrideForkFirst": [],
    "notes": "Locked from Q&A + self-resolutions"
  }
}
```

Directive fields:

- `delete` — accept upstream (or fork) deletion; harness `git rm`
- `checkoutTheirs` / `checkoutOurs` — whole-file side
- `mustEdit` — agents must edit; **never** auto `--ours` / `--theirs`
- `overrideForkFirst` — grill wins over `merge-policy.json` `forkFirst`
- `notes` — short rationale for the harness / children

## Rules

- Do **not** resolve conflict file contents yourself (except you may leave them for harness directives).
- Do **not** spawn children or Task subagents.
- Do **not** re-open settled product decisions.
- `unionPaths` in merge-policy are never auto ours/theirs — assign them to a child with `strategy: "union"` (or `mustEdit` if grill requires edits).
- If there are **zero** unmerged paths, still write a final plan with empty `childClusters` and locked directives (coherence/build-fix still run later). Record completed clusters in `notes`.
- On resume after capacity/crash: you are the **continuation planner**, not a greenfield grill. Preserve settled product decisions and finished cluster resolutions.

## Done

Write valid `merge-plan.json` + `merge-directives.json`, update `run.md`, then output:

<promise>UPSTREAM_SYNC_GRILL_COMPLETE</promise>

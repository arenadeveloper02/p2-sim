# Grill Q&A — 2026-08-04

## 2026-08-04 · PR #678

**Q** (2026-08-04T08:27:15Z, utcarshsrivastava-collab): # Open questions — upstream sync 2026-08-04 (PR #678)

Range: 518 commits, `e2fecc86` → `1b9e0f25` (v0.7.29 → v0.7.55). Everything else in this batch is resolved from `merge-policy.json` + ledger; full dispositions are in `run.md` under `## Grill analysis`. These two need a human because the answer is not in the repo.

Reply on PR #678 with `/upstream-sync resume` and your answers.

---

## Q1 — How should we reconcile the drizzle migration journal? (blocks a safe deploy, not the merge itself)

**What I measured.** `packages/db/scripts/migrate.ts` uses stock drizzle `migrate()`, which applies a migration only when its journal `when` is greater than the `created_at` of the most recently applied row. The fork's journal ends at `0261_local_copilot_user_memory` (`when` = 2026-07-18); upstream's ends at `0281_fixed_madame_web` (`when` = 2026-08-03). Six upstream migrations carry timestamps **earlier** than the fork's last applied one, so on a fork database that is already migrated past fork-0261 they will be **silently skipped** — no error, no log:

| idx | tag | what gets skipped |
|---|---|---|
| 258 | `gigantic_lady_mastermind` | `webhook_tiktok_credential_id_idx` |
| 259 | `slack_native_routing` | `webhook.routing_key` column; `webhook.path` NOT NULL drop |
| 260 | `unknown_sinister_six` | `paused_executions.automatic_resume_retry_count`, `workspace.storage_used_bytes`, `workspace.organization_assigned_at` |
| 261 | `tranquil_donald_blake` | tables `webhook_path_claim`, `workflow_deployment_operation` |
| 262 | `strong_storm` | `workspace_files.message_id` |
| 263 | `workflow_fork_sync_excluded` | `workflow.fork_sync_excluded` |

The upstream app code merged in this sync reads all of those, so a skip is a runtime break (missing column/table), not cosmetic drift. Fresh databases are unaffected.

Two complications rule out the obvious fixes:

- Fork migrations `0258`/`0259`/`0260` are **not idempotent** (bare `ADD COLUMN` / `CREATE TABLE` / `CREATE UNIQUE INDEX`), so giving them new tail timestamps makes them re-run and fail on existing databases.
- Keeping their original timestamps while moving them to the journal tail makes **fresh** databases skip the fork's own migrations instead.

File-level renumbering of the fork's `0258`–`0261` is required either way, because fork and upstream both own `0258/0259/0260_snapshot.json`.

**Please pick one:**

- **(a) Repo-side full fix (recommended).** Renumber fork `0258`–`0261` → `0282`–`0285` with fresh timestamps above upstream's max, rewrite them to be idempotent (`IF NOT EXISTS` / guarded `DO $$`), regenerate snapshots, **and** add a tail replay migration that re-emits upstream `0258`–`0263` idempotently. Converges both fresh and existing databases with no manual DBA step.
- **(b) Repo renumber only + ops step.** Renumber/regenerate as above, and you apply upstream `0258`–`0263` by hand (SQL + `__drizzle_migrations` rows) on each deployed database before rolling out the merged image.
- **(c) Nothing needed** — the deployed fork databases have not applied fork `0258`–`0261`, or they are rebuilt/`db:push`ed rather than migrated forward.

**What I need to know either way:** have the deployed fork databases (prod / staging / any long-lived environment) actually applied fork migrations `0258`–`0261`? That single fact decides between (a)/(b) and (c).

---

## Q2 — Deployed chat: keep voice mode, or take upstream's removal?

**What I measured.** `merge-policy.json` protects `apps/sim/app/chat/`, which does not exist in this fork. The fork's deployed chat actually lives at **`apps/sim/app/(interfaces)/chat/`** — 67 files, `+9,171/−532` versus the sync baseline — so a flagship fork surface currently has **no** policy protection. Upstream changed 23 files there in this range (`+1,572/−2,138`), including `#6215`/`#6218`, which **delete deployed-chat voice mode outright**: `components/voice-interface/`, `components/input/voice-input.tsx`, `hooks/use-audio-streaming.ts`, `hooks/queries/voice-settings.ts`, `lib/speech/config.ts`, and the server side (`/api/proxy/tts/stream`, parts of `/api/speech/token`). `#6212` (metering/throttling the TTS relay) lands just before the removal and is superseded by it.

The fork has touched exactly one voice file — `voice-interface.tsx`, 3 cosmetic lines. So git raises a delete/modify conflict on that one file while the whole server side deletes cleanly. **A per-file fork-first resolution produces a broken build**: fork voice UI importing modules upstream deleted. This is all-or-nothing.

**Please pick one:**

- **(a) Take upstream's removal wholesale (recommended).** Voice disappears from the deployed chat; the fork's 3-line cosmetic change is dropped with it. Coherent, no dangling imports.
- **(b) Keep voice.** Children explicitly restore the entire voice stack — UI, hooks, `voice-settings` query, `lib/speech/config.ts`, `/api/proxy/tts/stream`, the `/api/speech/token` behaviour — against upstream's deletion, and we own that stack from here on. If you choose this, please confirm we should also carry `#6212`'s TTS metering/throttling forward, since upstream's version of it was removed along with the feature.

**Related, and cheap to fix now:** should I add `apps/sim/app/(interfaces)/chat/` to `forkFirst` in `merge-policy.json` (replacing or alongside the non-existent `apps/sim/app/chat/`)? Every future sync will otherwise re-litigate this 9k-line surface with no recorded default.

## 2026-08-04 · PR #678

**Q** (2026-08-04T08:27:33.848Z, upstream-sync[bot]): Grill open questions must be answered before merge starts.
_Context: .upstream-sync/ledger/2026-08-04/open-questions.md_

## 2026-08-04 · PR #678

**A** (2026-08-04T08:36:34Z, utcarshsrivastava-collab): /upstream-sync resume


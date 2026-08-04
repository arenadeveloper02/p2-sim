# Upstream Sync — Grill Q&A Log

Rolling log of questions asked on sync PRs and human answers. Future sync runs read this file (and `qa-history.jsonl`) before asking again.

<!-- Entries are appended automatically by the harness from PR comments and resume replies. -->

## 2026-08-04 · PR #680

**Q** (2026-08-04T11:33:49Z, utcarshsrivastava-collab): # Open questions — upstream sync 2026-08-04

Two blocking decisions. Everything else in this 518-commit range is resolved from
`merge-policy.json` + codebase evidence and recorded in
`.upstream-sync/ledger/2026-08-04/run.md` under `## Grill analysis` (20 recorded decisions) —
please skim that section, but you only need to **answer the two questions below** to unblock
the merge.

Reply on this PR with `/upstream-sync resume` plus your answers.

---

## Q1 — 🔴 Six upstream migrations will be silently skipped on every existing Arena database. How do we fix it?

**This is the most serious finding of the run.** It is not a merge conflict, it does not fail
CI, and it does **not** reproduce on a fresh database — it only breaks already-deployed
environments.

**Why.** `drizzle-orm` decides what to apply from a **single high-water timestamp**
(`node_modules/drizzle-orm/pg-core/dialect.cjs:59-69`):

```sql
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1
```
then applies a file only when `max(created_at) < migration.folderMillis`.

The fork and upstream both used idx 0258–0261, and their journal `when` values **interleave**.
Arena prod has already applied the fork's four, so its high-water mark is
**`1784346920598`** (`0261_local_copilot_user_memory`). Six upstream migrations sit *below*
that and will therefore **never run**:

| upstream tag | `when` |
|---|---|
| `0258_gigantic_lady_mastermind` | 1783620533559 |
| `0259_slack_native_routing` | 1783722352108 |
| `0260_unknown_sinister_six` | 1783810442774 |
| `0261_tranquil_donald_blake` | 1784043925919 |
| `0262_strong_storm` | 1784224314431 |
| `0263_workflow_fork_sync_excluded` | 1784252317428 |

**What never gets created:** the `webhook_path_claim` table, the
`workflow_deployment_operation` table + 6 indexes (the deployment state machine from #5680 /
#5841 / #6229), 8 `webhook` columns (Slack native routing #5892), 4 `workspace` columns, a
`paused_executions` column (resume path #6187), a `workspace_files` column, `workflow.fork_sync_excluded`
(#5727), and 8 indexes. Result: green CI, then hard runtime failures in production on deploy,
webhook registration, execution resume and file paths.

**Aggravating factor:** fork migrations `0258`, `0259`, `0260` are **not idempotent** (plain
`ALTER TABLE … ADD COLUMN` / `CREATE TABLE`, no `IF NOT EXISTS`; only `0261` is guarded). So
simply renumbering them to `0282+` makes drizzle *replay* them on prod, where they will **fail**
on duplicate column/table and wedge the `migrations` service in `docker-compose.p2prod.yml`.

### Options

**(A) Re-stamp both sides — recommended.**
1. Renumber fork `0258→0282`, `0259→0283`, `0260→0284`, `0261→0285` (file + journal `idx`), with
   `when` just above upstream's `0281` (`1785776917545`).
2. Rewrite those four to be replay-safe (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
   guarded index/FK adds) so replay on an already-migrated DB is a no-op.
3. Re-stamp upstream `0258–0263`'s `when` into the free window
   `(1784346920598, 1784680777879)` — 334M ms of headroom, journal order and idx order both
   preserved — so they land above every existing environment's high-water mark.
- ✅ Works on fresh **and** existing databases; no manual per-environment SQL.
- ❌ Edits upstream-owned migration metadata, so step 3 recurs as a conflict in future syncs.

**(B) One-off `__drizzle_migrations` surgery per environment.** Keep all upstream files
untouched; on each deployed DB, manually insert/adjust rows so the six upstream files are
applied or considered applied.
- ✅ Zero upstream drift.
- ❌ Manual, per-environment, easy to forget on a new environment; needs its own runbook.

**(C) One-shot script migration.** Use the existing `packages/db/script-migrations/`
(`runScriptMigrations`) hook to force-apply the six upstream files idempotently on first boot
after this merge.
- ✅ Automated, no upstream file edits.
- ❌ Adds fork-owned code that duplicates upstream SQL; must be retired later.

**→ Which option?** (Default if you have no preference: **A**.)
**→ Also confirm:** can the harness verify migrations against a **restored clone of Arena
production**? Verifying only against a fresh DB cannot detect this class of defect, so a clean
CI run is not evidence that this is fixed.

---

## Q2 — 🔴 Upstream deleted the deployed-chat voice/TTS stack. Does Arena keep voice mode?

Upstream removed voice mode wholesale (#6215, #6218, #6220, #6224), deleting:

- `app/(interfaces)/chat/components/voice-interface/voice-interface.tsx`
- `app/(interfaces)/chat/components/voice-interface/components/particles.tsx`
- `app/(interfaces)/chat/components/input/voice-input.tsx`
- `app/(interfaces)/chat/hooks/use-audio-streaming.ts`
- `app/api/proxy/tts/stream/route.ts`
- `hooks/queries/voice-settings.ts`
- `lib/api/contracts/media/tts-stream.ts`

The fork's **fork-only** `app/(interfaces)/chat/[identifier]/ArenaDeployedChat.tsx` (~1600
lines) depends on all of it: it imports `VoiceInterface`, holds `isVoiceFirstMode`, streams
through `DEFAULT_VOICE_SETTINGS.voiceId = 'EXAVITQu4vr4xnSDxMaL'` (ElevenLabs "Bella"), and
reports `Prompt Type: Voice` to Mixpanel. This looks like a live, customer-facing Arena feature,
which is why I am not defaulting it.

`--ours` is not a coherent answer on its own: the fork only touched `voice-interface.tsx`
cosmetically (3 lines of dark-mode tokens), and `app/api/proxy/tts/stream/route.ts` is
unmodified by the fork, so it will disappear with **no conflict marker at all**.

### Options

**(A) Keep voice mode.** Skip the seven deletions for these paths, keep the fork's voice stack,
and **do** take #6212 (`fix(security): meter and throttle the deployed-chat TTS relay`, v0.7.54)
— upstream hardened the relay immediately before deleting it, so that hardening is worth having.
Cost: this subsystem is now fork-owned forever and every future upstream chat refactor must be
re-applied to it by hand.

**(B) Drop voice mode**, following upstream. Accept all seven deletions **and** strip voice-first
mode out of `ArenaDeployedChat.tsx` (state, handlers, ElevenLabs settings, the Mixpanel
`Prompt Type: Voice` branch). Cost: a visible Arena feature disappears for whoever uses it.

**→ (A) or (B)?** If (A), please also confirm whether voice should stay on the **deployed/public
chat** surface only, or also anywhere else it has been wired.

---

### Not asking about these — recorded as decisions in `run.md`

Flagged for visibility; tell me if any is wrong and I will change it, but none of them blocks
the merge: models.ts union · HubSpot union · `exa_research` retired (upstream verified HTTP 410
`RESEARCH_RETIRED`) · minimal tool registry removed · `apps/desktop/` taken · `ci.yml` fork-first
with upstream desktop + Blacksmith jobs skipped · `test-build.yml` upstream + the fork's
`check:secrets` step re-applied · scheduler stays on Trigger.dev (upstream's cron container lands
unused) · Arena branding assets fork-first · legacy folder tables migrated in fork-only files ·
fork billing markup preserved over upstream's attribution refactor · Turbopack cache flags follow
upstream's measurements.

## 2026-08-04 · PR #680

**Q** (2026-08-04T11:34:59.911Z, upstream-sync[bot]): Grill open questions must be answered before merge starts.
_Context: .upstream-sync/ledger/2026-08-04/open-questions.md_

## 2026-08-04 · PR #680

**A** (2026-08-04T12:44:30Z, utcarshsrivastava-collab): /upstream-sync resume


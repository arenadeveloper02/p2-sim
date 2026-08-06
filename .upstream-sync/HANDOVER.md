# Upstream Sync / GitHub Merge Agent — Handover

**Owner departing:** Utcarsh Srivastava (`utcarshsrivastava-collab` / `utcarsh.srivastava@position2.com`)  
**Date:** 2026-07-31  
**Repo:** [arenadeveloper02/p2-sim](https://github.com/arenadeveloper02/p2-sim) (fork of [simstudioai/sim](https://github.com/simstudioai/sim))  
**Feature branch:** `feat/github-merge-agent`

This document is the single entry point for whoever inherits the automated upstream-merge agent. Read this first, then the files it points to.

---

## 1. What this is

An automated harness that periodically merges `simstudioai/sim` `main` into our fork, using AI agents (Claude Code / Codex via [Sandcastle](https://www.npmjs.com/package/@ai-hero/sandcastle)) to:

1. Analyze upstream changes (grill / FBI)
2. Open a **draft PR** early
3. Merge + resolve conflicts with a **fork-first** policy
4. Verify (`check` / `lint` / `test` / `build`)
5. Pause for human answers via `/upstream-sync resume` on the draft PR when blocked

Goal: stop hand-merging hundreds of upstream commits and keep fork-owned product (Arena, Unipile, P2 docs, mothership admin, deploy scripts, etc.) intact.

### Control plane (2026-08-05)

The harness is **release-sliced** and **plan-driven**:

1. Each Actions run merges the next upstream `vX.Y.Z:` tip (not full `main`). Success may dispatch the next slice.
2. Parent Phase A (grill) writes `merge-plan.draft.json` + `## Parent plan`. Resume skips re-ask only — Phase B still finalizes after merge, **continuing from cluster reports + prior plan + WIP** (does not re-issue resolved work).
3. Harness applies directives (`mustEdit` / `overrideForkFirst` beat `forkFirst`), then spawns Luna children from the plan. Cluster reports land under `ledger/<runId>/clusters/`.
4. WIP overlays carry a `decisionHash` (directives + grill answers + merge-policy) and are skipped when stale. Capacity exhaustion mid-cluster → `status: blocked`, not completed.
5. **Build is left to CI.** Coherence always runs; harness verify is advisory check/lint/test only. Full `bun run build` OOMs the 7GB Actions runner — `.github/workflows/images.yml` owns it.

---

## 2. Current status (as of 2026-07-31)

| Item | Status |
|------|--------|
| Harness code on `feat/github-merge-agent` | **Built and iterated** — not yet merged to `version-5-main` |
| GitHub Actions workflow | **Live** on `feat/github-merge-agent` (push + cron + dispatch + PR comment resume) |
| First successful end-to-end sync into production branch | **Not done** — target is still the feature branch (TEMP) |
| `state.json` on feature branch | `status: "failed"`, `lastSyncedUpstreamSha: null` (no completed sync recorded on this checkout) |
| Active sync run | **In progress** — see §3 |
| Repo Actions **variables** | **None set** (workflow uses hardcoded TEMP fallbacks) |
| Repo Actions **secrets** | `ANTHROPIC_API_KEY`, `GH_PAT`, `UPSTREAM_SYNC_GH_TOKEN` present |

### Productionization blockers (must do before relying on this daily)

1. **Merge `feat/github-merge-agent` → `version-5-main`** (or whatever the live fork mainline is).
2. **Set repo variable** `UPSTREAM_SYNC_TARGET_BRANCH=version-5-main` and remove the TEMP fallback in `.github/workflows/upstream-sync.yml`.
3. **Replace PR reviewer** `utcarshsrivastava-collab` in `.upstream-sync/merge-policy.json` and/or set `UPSTREAM_SYNC_PR_REVIEWERS`.
4. Confirm `issue_comment` resume works **from the default branch** (GitHub only runs comment workflows that exist on the default branch).
5. Rotate / document who owns `GH_PAT` and `ANTHROPIC_API_KEY`.

---

## 3. Live run right now

| | |
|---|---|
| **Draft PR** | [#668](https://github.com/arenadeveloper02/p2-sim/pull/668) — `upstream-sync: merge simstudioai/sim main into feat/github-merge-agent (2026-07-31)` |
| **Sync branch** | `upstream-sync/2026-07-31T07-40-03` |
| **Actions run** | [30613701847](https://github.com/arenadeveloper02/p2-sim/actions/runs/30613701847) failed after ~3.5h with 3 unresolved hooks conflicts; resolutions were **not** pushed (mid-merge commit impossible). Resume [30629371704](https://github.com/arenadeveloper02/p2-sim/actions/runs/30629371704) re-merges from scratch until WIP persistence ships. |
| **Upstream HEAD** | `19d929b1` |
| **Baseline** | merge-base `e2fecc86` |
| **Range** | **429 upstream commits** |
| **Grill verdict** | Parent agent finished: **no human questions** — all conflicts classified as mechanical from `merge-policy.json` + `db-migrate` + registry union. See ledger on the sync branch. |

**Mid-merge WIP (harness):** After each child cluster, resolved files are snapshotted to sidecar branch `upstream-sync/<stamp>-wip` and pushed with `git push --force-with-lease` (never bare `--force`; never force-push non-`upstream-sync/*` refs). On resume, `applyMergeWip` overlays that branch onto remaining conflicts before agents run. Child agents **stage only** — they must not `git commit` while other `U` paths remain.

**Ops note:** Rotate expired `GH_PAT` / `UPSTREAM_SYNC_GH_TOKEN` (admin). `github.token` fallback works for checkout/REST, but GraphQL `gh pr view` may still fail for PR #668 until a valid PAT is set.

Ledger on that branch (not yet on local `feat/github-merge-agent` tip):

- `.upstream-sync/ledger/2026-07-31/run.md` — full grill analysis
- `.upstream-sync/ledger/2026-07-31/fbi-report.md` — 429 commits
- `.upstream-sync/ledger/2026-07-31/release-notes.md`
- `.upstream-sync/ledger/2026-07-31/skipped.md` — empty (nothing deliberately skipped)

**High-effort conflict classes the grill already flagged:**

- DB migration number collision (`0258`–`0261` on both sides) → renumber fork migrations after upstream’s `0277`, rebuild `_journal.json` (`db-migrate` skill)
- Destructive upstream migration `0276_drop_legacy_folder_tables.sql` — verify fork never reads legacy folder tables
- Large unions: `tools/registry.ts`, `blocks/registry(-maps).ts`, `apps/sim/lib/auth/`
- Fork-first touchpoints: `hooks/queries/mothership-admin.ts`, `lib/permission-groups/`

**How to watch / resume:**

```bash
gh -R arenadeveloper02/p2-sim run view 30613701847
gh -R arenadeveloper02/p2-sim pr view 668
# If blocked: answer on the PR, then comment:
# /upstream-sync resume
# Or: Actions → Upstream Sync → Run workflow → resume=true, resume_pr=668, skip_agent=false
```

---

## 4. What was built (inventory)

### 4.1 Harness (`.sandcastle/`)

| Path | Role |
|------|------|
| `main.ts` | Pipeline orchestrator (detect → draft PR → grill → merge → bootstrap lockfile → child clusters → verify → finalize) |
| `lib/config.ts` | State, ledger I/O, PR helpers, conflict clustering, merge-base resolution, mid-merge WIP persist/apply (`*-wip` + `--force-with-lease`) |
| `lib/agents.ts` | Anthropic (Claude Code) vs OpenAI (Codex) agent wiring |
| `lib/analysis.ts` | FBI baseline = `lastSyncedUpstreamSha` or git merge-base |
| `lib/lockfile-bootstrap.ts` | Deterministic `package.json` / `bun.lock` resolution **before** agents; never hand-edit lockfile |
| `lib/grill-state.ts` | Resume PR resolution; skip parent grill when answers exist |
| `lib/verify.ts` | `bun run check` → `lint` → `test` → `build` |
| `lib/usage.ts` | Token / USD cost reporting into ledger |
| `prompts/parent-orchestrator.md` | Parent grill agent prompt |
| `prompts/child-resolve-conflicts.md` | Per-cluster conflict agent prompt |
| `bootstrap-lockfile.ts` | CI resume helper |
| `Dockerfile` | Optional agent image (Claude Code + Codex) |
| `.env.example` | Local env template |

Entry point: `bun run upstream-sync` → `package.json` script → `.sandcastle/main.ts`  
Dependency: `@ai-hero/sandcastle` `0.10.0`

### 4.2 Policy & memory (`.upstream-sync/`)

| Path | Role |
|------|------|
| `merge-policy.json` | **Source of truth** for fork-first / upstream-first / manual-review paths, reviewers, post-merge regen |
| `state.json` | Last synced SHA, active PR/branch, status |
| `grill-log.md` | Rolling human Q&A (markdown) |
| `qa-history.jsonl` | Machine-readable Q&A |
| `extensibility-notes.md` | Structural notes to shrink future conflict surface |
| `ledger/<RUN_ID>/` | Per-run: `run.md`, `fbi-report.md`, `release-notes.md`, `skipped.md`, `grill-qa.md`, `usage.json` |
| `SYNC-BRANCH.md` | Scaffold commit so draft PRs always have a diff |

### 4.3 Agent skills & slash commands

Canonical skills under `.claude/skills/` (also mirrored under `.agents/skills/upstream-sync/`):

| Order | Skill | Purpose |
|------|-------|---------|
| 1 | `upstream-sync-grill` | Pre-merge analysis; PR questions |
| 2 | `upstream-sync` | Fork-first resolve + skipped ledger + verify |
| 3 | `diagnosing-bugs` | When verify fails |
| 4 | `tdd` | Regression tests for merge fixes |
| 5 | `review-upstream-merge` | Two-axis review before marking PR ready |

Index: `.claude/skills/README.md`  
Commands: `.claude/commands/upstream-sync*.md`, `review-upstream-merge.md`

Related Sim skills agents are told to read on demand: `db-migrate`, `react-query-best-practices`, `validate-integration`, `memory-load-check`, `cleanup`.

### 4.4 CI (`.github/workflows/upstream-sync.yml`)

Triggers:

- **Cron:** `0 6 * * *` (06:00 UTC daily)
- **workflow_dispatch:** `force`, `resume`, `resume_pr`, `skip_agent`, `agent_provider`
- **issue_comment:** `/upstream-sync resume` on the draft PR
- **push** to `feat/github-merge-agent` (paths: workflow, `.sandcastle/**`, `.upstream-sync/**`, `package.json`, `bun.lock`) — also activates `workflow_dispatch` on the feature branch

Defaults today (gate job):

- Scheduled / push runs: **`skip_agent=true`** unless dispatch overrides — so daily poll may only do git/verify unless you dispatch with `skip_agent=false`
- Resume via PR comment: **`skip_agent=false`**
- Agent mode default: `dual` (Claude Opus 5 parent + GPT-5.6 Luna children); also `anthropic` / `openai`

Important workflow comments (do not lose them):

- `issue_comment` only runs workflows present on the **repository default branch**
- Push to `upstream-sync/*` is **ignored** by the gate (avoids re-entrancy)
- Prefer validated `GH_PAT` / `UPSTREAM_SYNC_GH_TOKEN` over expired secrets that break checkout

Timeout: **360 minutes**.

### 4.5 Notable commits on `feat/github-merge-agent` (harness lineage)

```
90b63a5895 feat(ci): add Sandcastle upstream-sync harness for simstudioai/sim
… many CI/auth/PR/lockfile/resume fixes …
7f85a58dd0 feat: resume from PR, commit range monitoring, resolve before committing, token reporting
caa1f14909 fix(upstream-sync): reuse open PRs and fix cost reporting
b61fb26a35 chore(upstream-sync): group Actions logs and document PR reuse
0e742ead8d fix(upstream-sync): do not let expired GH_PAT break checkout
628310f19a fix(upstream-sync): validate GITHUB_TOKEN via repo API
```

Earlier sync attempts (closed PRs): #599, #603, #609–#615, etc. Manual-ish sync branch `upstream-sync/07-update-29-jun` also exists historically.

---

## 5. How the pipeline works

```
detect upstream delta (baseline → upstream HEAD)
        │
        ▼
scaffold ledger (FBI + release notes + skipped stub)
        │
        ▼
open/reuse draft PR early (questions land here)
        │
        ▼
parent grill agent ──asks──► PR comment <!-- upstream-sync-question -->
        │                      human replies + `/upstream-sync resume`
        ▼
git merge upstream/main
        │
        ▼
deterministic package-manager bootstrap (bun.lock regenerate)
        │
        ▼
child agents per conflict cluster (path prefix buckets)
        │
        ▼
verify: check → lint → test → build
        │
        ├─ fail / remaining conflicts → status awaiting_input, wait for resume
        └─ pass → update PR body, persist lastSyncedUpstreamSha, status completed
```

**Reuse policy:** if an open sync PR exists and its branch is on origin, the next run **extends** that PR when upstream advances. `FORCE_RUN` / `force: true` always opens a **fresh** branch/PR.

**Fork-first:** paths in `merge-policy.json` → `forkFirst` keep ours; `upstreamFirst` take theirs; `manualReview` need care (migrations, registries, auth). After merge: `bun run mship:generate` when contracts are touched.

---

## 6. How to operate

### Local

```bash
# Env: copy .sandcastle/.env.example → .sandcastle/.env
# Need: ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN), GH_PAT for PRs, upstream remote

git fetch upstream main
bun run upstream-sync

# Merge + verify only (no agents)
UPSTREAM_SYNC_SKIP_AGENT=true bun run upstream-sync

# Force even if SHA unchanged
UPSTREAM_SYNC_FORCE=true bun run upstream-sync
```

### GitHub Actions

```bash
# Full agent run against current TARGET_BRANCH
gh -R arenadeveloper02/p2-sim workflow run upstream-sync.yml \
  --ref feat/github-merge-agent \
  -f force=false -f resume=false -f skip_agent=false -f agent_provider=dual

# Resume a blocked PR
gh -R arenadeveloper02/p2-sim workflow run upstream-sync.yml \
  --ref feat/github-merge-agent \
  -f resume=true -f resume_pr=668 -f skip_agent=false
```

Or comment on the draft PR: `/upstream-sync resume` (plus answers).

### After a successful draft sync PR

1. Read ledger `skipped.md` and `run.md`
2. Run `/review-upstream-merge` (or have a human do the two-axis review)
3. Mark draft ready → merge into target branch (`version-5-main` once wired)
4. Confirm `state.json` on the **target** branch records `lastSyncedUpstreamSha`

---

## 7. Config: secrets, variables, reviewers

### Secrets (Settings → Secrets → Actions)

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Claude Code parent/child agents (**present**) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Optional alt to API key |
| `OPENAI_API_KEY` | Required for `dual` (Luna children) and `openai` |
| `GH_PAT` | Classic `ghp_*` with `repo` — preferred for fork PR push/create (**present**; watch expiry) |
| `UPSTREAM_SYNC_GH_TOKEN` | Alt PAT (**present**) |

Workflow fail-fast picks first valid token among `GH_PAT` → `UPSTREAM_SYNC_GH_TOKEN` → `github.token`, and warns if PATs are set but invalid.

### Variables (Settings → Variables → Actions) — **currently empty; set these**

| Variable | Suggested value | Notes |
|----------|-----------------|-------|
| `UPSTREAM_SYNC_TARGET_BRANCH` | `version-5-main` | **Required for production.** Today TEMP fallback is `feat/github-merge-agent` |
| `UPSTREAM_SYNC_PR_REVIEWERS` | `<successor-github-login>` | Comma-separated GitHub **usernames**, not emails |
| `UPSTREAM_REMOTE` | `upstream` | Optional |
| `UPSTREAM_REPO` | `simstudioai/sim` | Optional |
| `UPSTREAM_BRANCH` | `main` | Optional |

### Code defaults to change on handover

In `.upstream-sync/merge-policy.json`:

- `prReviewers`: currently `["utcarshsrivastava-collab"]` → successor
- `description`: already updated toward `version-5-main` (local uncommitted tweak may exist)

In `.github/workflows/upstream-sync.yml`:

- Remove TEMP `TARGET_BRANCH` fallback to `feat/github-merge-agent`
- Change `on.push.branches` from `feat/github-merge-agent` to default/`version-5-main` once merged
- Default gate `skip_agent=true` on schedule — decide whether daily runs should invoke agents (`false`) or only poll/skip-when-unchanged

Optional model overrides: `UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL` (default `claude-opus-5`), `UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL` (default `claude-sonnet-5`, anthropic-only), `UPSTREAM_SYNC_OPENAI_CHILD_MODEL` / `UPSTREAM_SYNC_OPENAI_MODEL` (default `gpt-5.6-luna`), `UPSTREAM_SYNC_IDLE_TIMEOUT_SECONDS` (default 7200). Dual mode requires both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.

---

## 8. Merge policy (fork ownership)

Strategy: **fork-first**. Preserve Arena/P2/Unipile/Facebook/Presentation/Figma/admin/chat/branding/session-cookie/deploy paths. Upstream wins on shared infra (deps, CI, security) unless the ledger says otherwise.

`upstreamFirst` today: `apps/sim/lib/copilot/generated/`  
`manualReview`: DB migrations/schema, `apps/sim/lib/auth/`, block/tool registries  
`regenerateAfterMerge`: `bun run mship:generate`

**Keep `forkFirst` accurate.** Any new fork product path not listed will be treated like shared code and may be overwritten. Update `merge-policy.json` when shipping new fork-owned surfaces.

---

## 9. What is left / recommended next steps

### Immediate (this week)

1. **Finish or triage PR #668 / run 30613701847** — child conflict resolution + verify on 429 commits; expect long runtime and possible `awaiting_input`.
2. **Hand over secrets ownership** — rotate `GH_PAT` / Anthropic key if Utcarsh-owned; confirm billing on Anthropic.
3. **Assign successor reviewer** in `merge-policy.json` + Actions variable.
4. **Decide target branch** (`version-5-main` vs stay on feature branch for more soak).

### Before calling it “done”

5. Land harness on the real default/mainline branch.
6. Set `UPSTREAM_SYNC_TARGET_BRANCH`; delete TEMP workflow fallbacks.
7. Confirm one full successful cycle: grill → merge → resolve → verify → draft PR → human merge into `version-5-main` → `lastSyncedUpstreamSha` persisted on that branch.
8. Confirm `/upstream-sync resume` via `issue_comment` after workflow exists on **default** branch.
9. Decide schedule behavior: agent-on by default vs `skip_agent` poll + manual full runs.
10. Fill `extensibility-notes.md` after first big sync (registry sidecars, fewer hand-edits to upstream files).

### Known sharp edges

- **Huge first sync:** with `lastSyncedUpstreamSha: null`, analysis uses merge-base → can be hundreds of commits (429 today). Cost and time are high; consider a one-time human-assisted catch-up, then rely on daily deltas.
- **Schedule defaults to `skip_agent=true`** — easy to think “daily sync” is agentic when it is not.
- **Expired `GH_PAT`** previously broke checkout; workflow now prefers `github.token` for checkout and validates PAT separately — still rotate dead secrets.
- **Lockfile:** agents must never hand-edit `bun.lock`; harness regenerates. If bootstrap fails, fix `package.json` conflicts manually then resume.
- **Ledger commits skipped while conflicts remain** — expected; do not force-commit mid-merge.
- Local `state.json` on `feat/github-merge-agent` may disagree with sync-branch state — trust the **active sync branch / PR** during a run.
- Uncommitted local change: `merge-policy.json` description already says `version-5-main` (commit or discard intentionally).

### Out of scope / not built

- Auto-merge of the draft sync PR into production (always human-gated).
- Slack/email alerts when blocked (PR comment + Actions status only).
- Multi-fork or non-`simstudioai/sim` upstream without config changes.
- Fully sandboxed agent execution in Docker in CI (workflow uses host + `noSandbox()`; Dockerfile exists but is not the Actions path today).

---

## 10. Mental model for the successor

1. **Policy lives in JSON**, not in chat — update `merge-policy.json` when fork ownership changes.
2. **Memory lives in the ledger** — never re-ask answered grill questions; read `grill-log.md` + `qa-history.jsonl`.
3. **Skipped upstream must be documented** in `skipped.md` with “what we miss”.
4. **Draft PR is the human UI** — questions, resume command, reviewers.
5. **Harness owns git merge orchestration**; agents own conflict *judgment* within policy.
6. **Verification is required** before calling a run complete.

---

## 11. Quick file map

```
.sandcastle/                    # Harness runtime
.upstream-sync/                 # Policy, state, ledger, THIS HANDOVER
.github/workflows/upstream-sync.yml
.claude/skills/upstream-sync*/
.claude/skills/review-upstream-merge/
.claude/skills/README.md
.agents/skills/upstream-sync/   # Mirror / Cursor skill entry
package.json                    # "upstream-sync": "bun run .sandcastle/main.ts"
```

---

## 12. Contacts / ownership checklist

- [ ] Successor named as GitHub reviewer (`UPSTREAM_SYNC_PR_REVIEWERS` + `merge-policy.json`)
- [ ] Successor has admin access to repo Actions secrets/variables
- [ ] Anthropic org / API key ownership transferred
- [ ] `GH_PAT` rotated to a service account (not a departing personal account)
- [ ] Team knows where this doc lives: **`.upstream-sync/HANDOVER.md`**
- [ ] Link this file from the team wiki / Notion / onboarding doc
- [ ] Close or reassign open draft sync PRs after handover

---

*Generated for handover on 2026-07-31. Update §2–§3 when PR #668 finishes and when the harness lands on `version-5-main`.*

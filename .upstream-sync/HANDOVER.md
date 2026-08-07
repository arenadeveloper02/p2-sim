# Upstream Sync / GitHub Merge Agent — Handover

**Owner departing:** Utcarsh Srivastava (`utcarshsrivastava-collab` / `utcarsh.srivastava@position2.com`)  
**Updated:** 2026-08-07 (originally 2026-07-31 — see `HANDOVER.original.md` for the first snapshot)  
**Repo:** [arenadeveloper02/p2-sim](https://github.com/arenadeveloper02/p2-sim) (fork of [simstudioai/sim](https://github.com/simstudioai/sim))  
**Feature branch:** `feat/github-merge-agent`

This document is the single entry point for whoever inherits the automated upstream-merge agent. Read this first, then the files it points to.

---

## 1. What this is

An automated harness that periodically merges `simstudioai/sim` `main` into our fork, using AI agents (Claude Code / Codex via [Sandcastle](https://www.npmjs.com/package/@ai-hero/sandcastle)) to:

1. Analyze upstream changes (grill / FBI) and draft a **merge plan**
2. Open a **stacked draft PR** per release batch
3. Merge + resolve conflicts with a **fork-first** policy (plan-driven Luna children)
4. Verify advisory (`check` / `lint` only — test/build left to CI)
5. Pause for human answers via `/upstream-sync resume` on the draft PR when blocked
6. On complete: mirror tip pointers onto the land-target branch and auto-dispatch the next batch if more releases remain

Goal: stop hand-merging hundreds of upstream commits and keep fork-owned product (Arena, Unipile, P2 docs, mothership admin, deploy scripts, etc.) intact.

### Control plane (as of 2026-08-06)

The harness is **release-sliced**, **plan-driven**, and **stack-based**:

1. Each Actions run merges **up to 6** upstream `vX.Y.Z:` tips (or fewer if that is all remaining) — not full `main`. Override with `min_releases` / `UPSTREAM_SYNC_MIN_RELEASES`. `until_sha` / positive `max_commits` are smoke escapes only (`max_commits=0` = release-batch).
2. Parent Phase A (grill) writes `merge-plan.draft.json` + `## Parent plan`. Resume skips re-ask only — Phase B still finalizes after merge, **continuing from cluster reports + prior plan + WIP** (does not re-issue resolved work).
3. Harness applies locked directives (`mustEdit` / `overrideForkFirst` / `delete` / `checkoutOurs` / `checkoutTheirs` beat `forkFirst`), then spawns Luna children from the plan. Cluster reports land under `ledger/<runId>/clusters/`. Prefix clustering is **fallback only** when the final plan is missing/empty.
4. WIP overlays carry a `decisionHash` (directives + grill answers + merge-policy) and are skipped when stale (operational `/upstream-sync resume` comments do not invalidate). Capacity exhaustion mid-cluster → `status: blocked`, not completed; WIP is persisted for resume.
5. **Each batch opens a NEW stacked draft PR** based on the previous tip (not reuse/extend). `FORCE_RUN` starts a fresh stack and closes open stack PRs.
6. **Tip-only landing:** merge the tip PR into the target branch; lower stack PRs are review artifacts and close as superseded.
7. After each complete, tip pointers (`state.json` / `stack.json`) are **mirrored onto the land-target branch** so auto-chained runs keep stacking. Success may dispatch the next batch via `gh workflow run`.
8. **Build and tests are left to CI.** Coherence always runs; harness verify is advisory `check`/`lint` only. Full `bun run build` OOMs the 7GB Actions runner — `.github/workflows/images.yml` owns builds. `bun run test` is also skipped in the harness.
9. Usage rollup (this slice / prior stack / whole stack) lands on PR bodies, the Actions job summary, and `ledger/<runId>/stack-usage.json`.

---

## 2. Current status (as of 2026-08-07)

| Item | Status |
|------|--------|
| Harness code on `feat/github-merge-agent` | **Built and iterated** — not yet merged to `version-5-main` |
| GitHub Actions workflow | **Live** on `feat/github-merge-agent` (push registers dispatch; weekly cron + dispatch + PR comment resume) |
| Sync progress on feature branch | **Catch-up in progress via stacked PRs** — tip completed through `578d9ddc` (batch `v0.7.38…v0.7.43`) |
| `state.json` on feature branch | `status: "completed"`, `lastSyncedUpstreamSha: 578d9ddc…`, `lastRunId: 2026-08-06-5`, tip PR **#689** |
| Active stack | **5 open stacked draft PRs** — see §3 |
| Repo Actions **variables** | Still mostly unset (TEMP fallbacks in workflow) |
| Repo Actions **secrets** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (for dual), `GH_PAT`, `UPSTREAM_SYNC_GH_TOKEN` — rotate as needed |
| Schedule | **Weekly Monday 06:00 UTC** (`0 6 * * 1`) — was daily; changed 2026-08-06 |

### Productionization blockers (must do before relying on this in production)

1. **Merge `feat/github-merge-agent` → `version-5-main`** (or whatever the live fork mainline is).
2. **Set repo variable** `UPSTREAM_SYNC_TARGET_BRANCH=version-5-main` and remove the TEMP fallback in `.github/workflows/upstream-sync.yml`.
3. **Replace PR reviewer** `utcarshsrivastava-collab` in `.upstream-sync/merge-policy.json` and/or set `UPSTREAM_SYNC_PR_REVIEWERS`.
4. Confirm `issue_comment` resume works **from the default branch** (GitHub only runs comment workflows that exist on the default branch).
5. Rotate / document who owns `GH_PAT` and `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
6. **Land the tip** of the current stack into the target (tip-only); do not merge every lower stack PR.

---

## 3. Live stack right now

Tip-only: review/merge **#689**; lower PRs are stacking artifacts.

| Run ID | Releases | Upstream SHA | Sync branch | Draft PR | Status |
|--------|----------|--------------|-------------|----------|--------|
| `2026-08-06` | (pre-release / catch-up slice) | `6c3d11b2…` | `upstream-sync/2026-08-05T10-46-19` | [#681](https://github.com/arenadeveloper02/p2-sim/pull/681) | open (superseded by later tips) |
| `2026-08-06-2` | `v0.7.30` | `207785c8…` | `upstream-sync/2026-08-06T10-38-40` | [#685](https://github.com/arenadeveloper02/p2-sim/pull/685) | open |
| `2026-08-06-3` | `v0.7.31` | `e01bfb14…` | `upstream-sync/2026-08-06T11-28-59` | [#687](https://github.com/arenadeveloper02/p2-sim/pull/687) | open |
| `2026-08-06-4` | `v0.7.32` | `9d23e25c…` | `upstream-sync/2026-08-06T11-45-10` | [#688](https://github.com/arenadeveloper02/p2-sim/pull/688) | open |
| **`2026-08-06-5` (tip)** | **`v0.7.38…v0.7.43`** | **`578d9ddc…`** | `upstream-sync/2026-08-06T13-57-59` | **[#689](https://github.com/arenadeveloper02/p2-sim/pull/689)** | **open — land this** |

Machine-readable copy: `.upstream-sync/stack.json` (also embedded in `state.json`).

**Historical note — PR #668 (2026-07-31):** First large 429-commit attempt. Failed mid-merge (unresolved hooks + no WIP persistence at the time; later resume hit missing Anthropic secret in one local/outcome path). Superseded by the release-sliced stack above. Old ledger may still exist on that sync branch / worktree.

**Mid-merge WIP (harness):** After each child cluster, resolved files are snapshotted to sidecar branch `upstream-sync/<stamp>-wip` and pushed with `git push --force-with-lease` (never bare `--force`; never force-push non-`upstream-sync/*` refs). On resume, `applyMergeWip` overlays that branch onto remaining conflicts before agents run. Merge-plan artifacts are snapshotted onto WIP so resume does not replan from scratch. Child agents **stage only** — they must not `git commit` while other `U` paths remain.

**Ops note:** Rotate expired `GH_PAT` / `UPSTREAM_SYNC_GH_TOKEN` (admin). Classic `ghp_*` needs `repo` + `workflow` scopes — Actions `GITHUB_TOKEN` **cannot** push `.github/workflows/*` (platform rule). Fail-fast validates PAT via a real workflow push probe.

**How to watch / resume:**

```bash
gh -R arenadeveloper02/p2-sim pr view 689
# If blocked: answer on the PR, then comment:
# /upstream-sync resume
# Or: Actions → Upstream Sync → Run workflow → resume=true, resume_pr=689, skip_agent=false
```

---

## 4. What was built (inventory)

### 4.1 Harness (`.sandcastle/`)

| Path | Role |
|------|------|
| `main.ts` | Pipeline orchestrator (detect → draft PR → grill → merge → bootstrap lockfile → Phase B finalize → child clusters → coherence → verify → tip mirror → optional next dispatch) |
| `lib/config.ts` | State, stack, ledger I/O, PR helpers, merge-base, mid-merge WIP persist/apply (`*-wip` + `--force-with-lease`), decisionHash |
| `lib/analysis.ts` | FBI baseline = `lastSyncedUpstreamSha` or git merge-base; **release-batch tip** resolution (`DEFAULT_MIN_RELEASES = 6`) |
| `lib/merge-plan.ts` | Draft/final merge plan + locked `merge-directives.json`; resume continues from cluster reports |
| `lib/cluster-report.ts` | Per-cluster ours/theirs/manual/deleted reports under `ledger/<runId>/clusters/` |
| `lib/clusters.ts` | Fallback prefix clustering (`groupConflictClusters`) when plan is missing |
| `lib/wip-stability.ts` | When to apply vs skip WIP overlays (hash / grill-answer stability) |
| `lib/agents.ts` | Anthropic (Claude Code) vs OpenAI (Codex) wiring; dual Opus parent + Luna children; capacity retries |
| `lib/lockfile-bootstrap.ts` | Deterministic `package.json` union + `bun.lock` regen **before** agents; never hand-edit lockfile |
| `lib/grill-state.ts` | Resume PR resolution; skip parent grill re-ask when answers exist |
| `lib/verify.ts` | Advisory `bun run check` → `lint` (test/build skipped — CI owns them) |
| `lib/usage.ts` | Token / USD cost reporting; cancel recording; stack rollup |
| `lib/job-summary.ts` | GitHub Actions job summary (usage + outcome) |
| `prompts/parent-orchestrator.md` | Parent grill agent prompt (Phase A) |
| `prompts/parent-finalize-plan.md` | Parent Phase B finalize prompt |
| `prompts/child-resolve-conflicts.md` | Per-cluster conflict agent prompt |
| `prompts/child-finalize-merge.md` | Child finalize / coherence-oriented prompt |
| `prompts/child-fix-build.md` | Child fix-build prompt (advisory path) |
| `bootstrap-lockfile.ts` | CI resume helper |
| `recover-usage.ts` | Recover usage from agent stream logs after cancel |
| `Dockerfile` | Optional agent image (Claude Code + Codex) — **not** the Actions path today |
| `.env.example` | Local env template (dual agents, capacity retries, PAT notes) |

Tests live next to modules (`*.test.ts`). Entry: `bun run upstream-sync` → `.sandcastle/main.ts`. Dependency: `@ai-hero/sandcastle` `0.10.0`.

### 4.2 Policy & memory (`.upstream-sync/`)

| Path | Role |
|------|------|
| `merge-policy.json` | **Source of truth** — `forkFirst` / `upstreamFirst` / `unionPaths` / `manualReview` (hint only) / `packageJson` union / reviewers / `regenerateAfterMerge` |
| `state.json` | Last synced SHA, active PR/branch, status, embedded stack |
| `stack.json` | Stacked draft PR lineage (runId, releaseVersion, upstreamSha, branch, prNumber) |
| `grill-log.md` | Rolling human Q&A (markdown) |
| `qa-history.jsonl` | Machine-readable Q&A |
| `extensibility-notes.md` | Structural notes to shrink future conflict surface |
| `ledger/<RUN_ID>/` | Per-run artifacts (see §4.2b) |
| `HANDOVER.md` | This doc |
| `HANDOVER.original.md` | Frozen 2026-07-31 handover snapshot |
| `SYNC-BRANCH.md` | Scaffold commit so draft PRs always have a diff (on sync branches) |

#### 4.2b Ledger files per run

| File | Purpose |
|------|---------|
| `run.md` | Full run log (+ `## Parent plan`) |
| `fbi-report.md` | FBI commit list |
| `release-notes.md` | Upstream release notes in range |
| `skipped.md` | Declined upstream changes |
| `grill-qa.md` | This run's Q&A |
| `open-questions.md` | Unanswered grill questions (merge gate) |
| `merge-plan.draft.json` | Phase A parent plan |
| `merge-plan.json` | Phase B locked plan + child clusters |
| `merge-directives.json` | Locked harness directives |
| `clusters/<id>.json` | Per-cluster resolution report |
| `usage.json` / `stack-usage.json` | Cost for this slice / stack rollup |
| `outcome.json` | Terminal outcome for Actions/PR |

### 4.3 Agent skills & slash commands

Canonical skills under `.claude/skills/` (also under `.agents/skills/` where mirrored):

| Order | Skill | Purpose |
|------|-------|---------|
| 1 | `upstream-sync-grill` | Phase A: analysis + FBI + **draft merge plan** |
| 2 | `upstream-sync` | Fork-first resolve + skipped ledger + verify (documents release-batch + stack semantics) |
| 3 | `diagnosing-bugs` | When verify fails |
| 4 | `tdd` | Regression tests for merge fixes |
| 5 | `review-upstream-merge` | Two-axis review before marking PR ready |

Related Sim skills agents read on demand: `db-migrate`, `react-query-best-practices`, `validate-integration`, `memory-load-check`, `cleanup`.

### 4.4 CI (`.github/workflows/upstream-sync.yml`)

Triggers:

- **Cron:** `0 6 * * 1` (Monday 06:00 UTC weekly)
- **workflow_dispatch:** `force`, `resume`, `resume_pr`, `skip_agent`, `agent_provider`, `max_commits` (0 = release-batch), `min_releases` (default 6), `until_sha`
- **issue_comment:** `/upstream-sync resume` on the draft PR
- **push** to `feat/github-merge-agent` (paths: workflow, `.sandcastle/**`, `.upstream-sync/**`, `package.json`, `bun.lock`) — registers `workflow_dispatch` only; **does not** auto-run the harness (`should_run=false` on push to avoid racing live agent runs)

Defaults today (gate job):

- Scheduled runs: **`skip_agent=true`** unless dispatch overrides — weekly poll may only do git/verify unless you dispatch with `skip_agent=false`
- Resume via PR comment: **`skip_agent=false`**
- Agent mode default: `dual` (Claude Opus 5 parent + GPT-5.6 Luna children); also `anthropic` / `openai`
- Concurrency: harness group `upstream-sync`; push events use a separate group so fix pushes do not cancel agent runs

Important workflow comments (do not lose them):

- `issue_comment` only runs workflows present on the **repository default branch**
- Prefer validated `GH_PAT` / `UPSTREAM_SYNC_GH_TOKEN` (`repo` + `workflow`) over expired secrets
- Pager shims (`PAGER=cat`, etc.) avoid silent hangs in CI
- Idle timeouts: child 1800s / overall 3600s (overridable)

Timeout: **360 minutes**. Permissions: `write-all`.

### 4.5 Notable commits on `feat/github-merge-agent` (harness lineage, newest first)

```
ec90b531af upstream-sync(2026-08-06-5): mirror tip pointers (PR #689)
… tip mirrors for #688 / #687 …
073defb943 chore(upstream-sync): poll weekly instead of daily
d3f73097c8 feat(upstream-sync): batch up to 6 releases per stacked PR
d45d18615c fix(upstream-sync): mirror tip pointers on complete; skip harness tests
c15c23d068 feat(upstream-sync): stack one draft PR per upstream release
d5f4b22977 fix(upstream-sync): skip full bun run build in harness
fee22cd756 / 7c7b13c6 / 9f6de4bc — WIP reuse across runIds / draft-vs-final hash / policy trim
b401cf81ea fix(upstream-sync): snapshot merge-plan onto WIP so resume does not replan
d12284bbc8 fix(upstream-sync): continue Phase B from completed cluster reports
689c02b686 feat(upstream-sync): slice by release and drive children from merge-plan
6ef3197e41 fix(upstream-sync): retry agent runs on model capacity errors
c563bb9afc fix(upstream-sync): unlisted paths are agent-reviewed, not --ours
a9840db3b5 fix(upstream-sync): union-merge package.json instead of --theirs
57c7d80a67 feat(upstream-sync): dual Opus+Luna agents, cut cluster cost
58fb01c923 fix(upstream-sync): gate merge on grill answers
6de1e415d0 fix(upstream-sync): treat verification as advisory
… earlier: WIP persist, PAT validation, lockfile bootstrap, early draft PR …
90b63a5895 feat(ci): add Sandcastle upstream-sync harness for simstudioai/sim
```

Earlier sync attempts (closed PRs): #599, #603, #609–#615, #668, etc.

---

## 5. How the pipeline works

```
detect delta (baseline → next release-batch tip, default ≤6 vX.Y.Z tips)
        │
        ▼
scaffold ledger (FBI + release notes + skipped stub)
        │
        ▼
open NEW stacked draft PR on previous tip (FORCE_RUN = fresh stack)
        │
        ▼
parent grill (Phase A) ──asks──► PR comment <!-- upstream-sync-question -->
        │                         human replies + `/upstream-sync resume`
        │                         writes merge-plan.draft.json
        ▼
git merge resolved upstream tip
        │
        ▼
deterministic package-manager bootstrap (package.json union + bun.lock)
        │
        ▼
WIP overlay (decisionHash) → parent finalize (Phase B) → merge-plan.json + directives
        │
        ▼
apply directives → Luna children per planned cluster → cluster reports → coherence
        │                         (capacity block → persist WIP, status blocked)
        ▼
verify advisory: check → lint   (test/build → CI)
        │
        ├─ fail / remaining conflicts / open questions → awaiting_input / blocked
        └─ pass → update PR body + usage rollup
                    → persist lastSyncedUpstreamSha on tip
                    → mirror tip pointers onto land-target branch
                    → dispatch next batch if more releases remain
```

**Stack / reuse policy:** each successful batch opens a **new** draft PR based on the previous tip. Do not expect the old “extend the same PR when upstream advances” behavior for release batches. `FORCE_RUN` / `force: true` closes open stack PRs and starts fresh.

**Fork-first resolution rules** (`.upstream-sync/merge-policy.json`):

| List | Behavior |
|------|----------|
| `forkFirst` | Auto `--ours` (unless directive overrides) |
| `upstreamFirst` | Auto `--theirs` |
| `unionPaths` | Agent-reviewed union — keep fork-only **and** take upstream additions |
| `manualReview` | Hint list of hard shared paths — **not** a closed set |
| *(unlisted)* | **Agent-reviewed** — never auto-pick a side |
| `packageJson` | Union-merge (upstream base + fork-only scripts/deps); `dropScripts` for known junk |

After merge: `bun run mship:generate` when contracts are touched (`regenerateAfterMerge`). Agents **should extend** `merge-policy.json` when they learn a recurring rule.

---

## 6. How to operate

### Local

```bash
# Env: copy .sandcastle/.env.example → .sandcastle/.env
# Need: ANTHROPIC_API_KEY (+ OPENAI_API_KEY for dual), PAT for workflow pushes, upstream remote

git fetch upstream main
bun run upstream-sync

# Merge + verify only (no agents)
UPSTREAM_SYNC_SKIP_AGENT=true bun run upstream-sync

# Force even if SHA unchanged (also resets stack)
UPSTREAM_SYNC_FORCE=true bun run upstream-sync

# Smoke: one commit or one release
UPSTREAM_SYNC_MAX_COMMITS=1 bun run upstream-sync
UPSTREAM_SYNC_MIN_RELEASES=1 bun run upstream-sync
```

### GitHub Actions

```bash
# Full agent run — next batch of up to 6 releases against TARGET_BRANCH
gh -R arenadeveloper02/p2-sim workflow run upstream-sync.yml \
  --ref feat/github-merge-agent \
  -f force=false -f resume=false -f skip_agent=false -f agent_provider=dual \
  -f max_commits=0 -f min_releases=6

# Resume a blocked tip PR
gh -R arenadeveloper02/p2-sim workflow run upstream-sync.yml \
  --ref feat/github-merge-agent \
  -f resume=true -f resume_pr=689 -f skip_agent=false
```

Or comment on the draft PR: `/upstream-sync resume` (plus answers).

### After a successful tip sync PR

1. Read ledger `skipped.md`, `run.md`, and `stack-usage.json`
2. Run `/review-upstream-merge` (or human two-axis review) on the **tip**
3. Mark tip draft ready → merge tip into target (`version-5-main` once wired)
4. Lower stack PRs close as superseded — do not land them individually
5. Confirm `state.json` / `stack.json` on the **target** branch record `lastSyncedUpstreamSha` (tip mirror should have done this)

---

## 7. Config: secrets, variables, reviewers

### Secrets (Settings → Secrets → Actions)

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Claude Code parent (and children in `anthropic` mode) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Optional alt to API key |
| `OPENAI_API_KEY` | Required for `dual` (Luna children) and `openai` |
| `GH_PAT` | Classic `ghp_*` with `repo` + **`workflow`** — required to push workflow files |
| `UPSTREAM_SYNC_GH_TOKEN` | Alt PAT (same scopes) |

Workflow fail-fast picks first valid push-capable token among `GH_PAT` → `UPSTREAM_SYNC_GH_TOKEN`, proves it with a real workflow push, and warns if secrets are set but invalid. Plain `github.token` is not enough for workflow-file pushes.

### Variables (Settings → Variables → Actions) — **set these for production**

| Variable | Suggested value | Notes |
|----------|-----------------|-------|
| `UPSTREAM_SYNC_TARGET_BRANCH` | `version-5-main` | **Required for production.** Today TEMP fallback is `feat/github-merge-agent` |
| `UPSTREAM_SYNC_PR_REVIEWERS` | `<successor-github-login>` | Comma-separated GitHub **usernames**, not emails |
| `UPSTREAM_REMOTE` | `upstream` | Optional |
| `UPSTREAM_REPO` | `simstudioai/sim` | Optional |
| `UPSTREAM_BRANCH` | `main` | Optional |
| `UPSTREAM_SYNC_CLUSTER_MIN_SEGMENTS` | `4` | Fallback clustering knobs |
| `UPSTREAM_SYNC_CLUSTER_MAX_FILES` | `12` | |
| `UPSTREAM_SYNC_CLUSTER_MAX_DEPTH` | `5` | |
| `UPSTREAM_SYNC_CLUSTER_MAX_DYNAMIC_ROUNDS` | `2` | |

### Code defaults to change on handover

In `.upstream-sync/merge-policy.json`:

- `prReviewers`: currently `["utcarshsrivastava-collab"]` → successor
- `description` already documents agent-reviewed unlisted paths + unionPaths + packageJson union

In `.github/workflows/upstream-sync.yml`:

- Remove TEMP `TARGET_BRANCH` fallback to `feat/github-merge-agent`
- Change `on.push.branches` from `feat/github-merge-agent` to default/`version-5-main` once merged
- Default gate `skip_agent=true` on schedule — decide whether weekly runs should invoke agents (`false`) or only poll

Optional model / retry overrides: `UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL` (default `claude-opus-5`), `UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL` (default `claude-sonnet-5`, anthropic-only), `UPSTREAM_SYNC_OPENAI_CHILD_MODEL` / `UPSTREAM_SYNC_OPENAI_MODEL` (default `gpt-5.6-luna`), `UPSTREAM_SYNC_IDLE_TIMEOUT_SECONDS` / `UPSTREAM_SYNC_CHILD_IDLE_TIMEOUT_SECONDS`, `UPSTREAM_SYNC_CAPACITY_RETRIES` (+ base/max ms). Dual mode requires both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.

---

## 8. Merge policy (fork ownership)

Strategy: **fork-first**. Preserve Arena/P2/Unipile/Facebook/Presentation/Figma/admin/chat/branding/session-cookie/deploy paths. Upstream wins on shared infra (deps, CI, security) unless the ledger says otherwise.

Highlights today:

- `upstreamFirst`: `apps/sim/lib/copilot/generated/`
- `unionPaths`: schema, tool/block registries, env-flags, org membership, oauth types, providers/models, …
- `manualReview` (hints): DB migrations/schema, auth, registries, permission-groups, mothership, hubspot, chat surfaces
- `packageJson.strategy`: `union` with `dropScripts: ["dev:full:minimal-registry"]`
- `regenerateAfterMerge`: `bun run mship:generate`

**Keep `forkFirst` / `unionPaths` accurate.** Unlisted paths are agent-reviewed (not silently ours). Update `merge-policy.json` when shipping new fork-owned surfaces or learning recurring union rules.

---

## 9. What is left / recommended next steps

### Immediate

1. **Review and land tip PR #689** into the land-target (tip-only); close/supersede lower stack PRs as designed.
2. Confirm auto-chained next batch (or dispatch manually) if more upstream releases remain past `578d9ddc`.
3. **Hand over secrets ownership** — rotate `GH_PAT` / Anthropic / OpenAI keys if Utcarsh-owned.
4. **Assign successor reviewer** in `merge-policy.json` + Actions variable.
5. **Decide target branch** (`version-5-main` vs stay on feature branch for more soak).

### Before calling it “done”

6. Land harness on the real default/mainline branch.
7. Set `UPSTREAM_SYNC_TARGET_BRANCH`; delete TEMP workflow fallbacks.
8. Confirm one full production cycle: grill → merge → resolve → advisory verify → tip PR → human merge into `version-5-main` → tip pointers mirrored → next batch stacks cleanly.
9. Confirm `/upstream-sync resume` via `issue_comment` after workflow exists on **default** branch.
10. Decide schedule behavior: agent-on by default vs `skip_agent` poll + manual full runs.
11. Keep filling `extensibility-notes.md` (registry sidecars, fewer hand-edits to upstream files).

### Known sharp edges

- **Huge first sync is gone as a single merge** — release-batch + stacking replaced the 429-commit one-shot; still expect cost/time per batch with agents on.
- **Schedule defaults to `skip_agent=true`** — easy to think “weekly sync” is agentic when it is not.
- **Expired / under-scoped PAT** — needs `workflow` scope; fail-fast proves with a real push.
- **Lockfile:** agents must never hand-edit `bun.lock`; harness regenerates. If bootstrap fails, fix `package.json` conflicts manually then resume.
- **Ledger commits skipped while conflicts remain** — expected; do not force-commit mid-merge.
- **Capacity blocks** — mid-cluster model capacity → `blocked` + WIP persist; resume after capacity recovers (retries with jitter exist).
- **Test/build not in harness** — do not treat harness green as “CI green”; watch `images.yml` / test workflows after landing.
- Local `state.json` may disagree with tip during a live run — trust the **active sync branch / tip PR**.
- Codex CLI 0.122+ needs `auth.json` written by the harness (already handled).

### Out of scope / not built

- Auto-merge of the draft tip PR into production (always human-gated).
- Slack/email alerts when blocked (PR comment + Actions status only).
- Multi-fork or non-`simstudioai/sim` upstream without config changes.
- Fully sandboxed agent execution in Docker in CI (workflow uses host + `noSandbox()`; Dockerfile exists but is not the Actions path today).

---

## 10. Mental model for the successor

1. **Policy lives in JSON**, not in chat — update `merge-policy.json` when fork ownership changes.
2. **Plan lives in the ledger** — Phase A draft → Phase B lock; resume continues, does not undo.
3. **Memory lives in the ledger** — never re-ask answered grill questions; read `grill-log.md` + `qa-history.jsonl`.
4. **Skipped upstream must be documented** in `skipped.md` with “what we miss”.
5. **Stacked draft PRs are the human UI** — tip-only land; questions, resume, reviewers, usage rollup.
6. **Harness owns git merge orchestration**; agents own conflict *judgment* within policy + directives.
7. **Verification is advisory in the harness**; CI owns test/build truth before calling production done.

---

## 11. Quick file map

```
.sandcastle/                    # Harness runtime (+ lib tests, prompts, recover-usage)
.upstream-sync/                 # Policy, state, stack, ledger, THIS HANDOVER
.github/workflows/upstream-sync.yml
.claude/skills/upstream-sync*/
.claude/skills/upstream-sync-grill/
.claude/skills/review-upstream-merge/
.claude/skills/README.md
.agents/skills/upstream-sync/   # Mirror / Cursor skill entry
package.json                    # "upstream-sync": "bun run .sandcastle/main.ts"
```

---

## 12. Contacts / ownership checklist

- [ ] Successor named as GitHub reviewer (`UPSTREAM_SYNC_PR_REVIEWERS` + `merge-policy.json`)
- [ ] Successor has admin access to repo Actions secrets/variables
- [ ] Anthropic + OpenAI org / API key ownership transferred
- [ ] `GH_PAT` rotated to a service account with `repo` + `workflow` (not a departing personal account)
- [ ] Team knows where this doc lives: **`.upstream-sync/HANDOVER.md`**
- [ ] Link this file from the team wiki / Notion / onboarding doc
- [ ] Land tip of open stack (currently **#689**) or reassign; close superseded lower PRs after tip lands
- [ ] Confirm tip-pointer mirror on land-target after next complete

---

*Updated 2026-08-07 for release-batch stacking, plan-driven children, tip mirroring, weekly cron, and advisory verify. Original 2026-07-31 snapshot: `HANDOVER.original.md`. Update §2–§3 when tip #689 lands and when the harness moves to `version-5-main`.*

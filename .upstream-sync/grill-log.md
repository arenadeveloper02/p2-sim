# Upstream Sync — Grill Q&A Log

Rolling log of questions asked on sync PRs and human answers. Future sync runs read this file (and `qa-history.jsonl`) before asking again.

<!-- Entries are appended automatically by the harness from PR comments and resume replies. -->

## 2026-08-05 · PR #681

**A** (2026-08-05T12:08:12Z, utcarshsrivastava-collab): /upstream-sync resume

Continuing after cancelling the hung `child-branding-landing` Codex pager stall. Re-apply WIP from `upstream-sync/2026-08-05T10-46-19-wip` and keep going on remaining conflicts.

## 2026-08-06-4 · PR #688

**Q** (2026-08-06T11:59:33Z, utcarshsrivastava-collab): # Open questions — upstream sync 2026-08-06-4 (v0.7.32 → v0.7.37, 63 commits)

Predicted merge: **93 conflicted files** (`git merge-tree` tree `92ae4f94`). I self-resolved
83 of them from `merge-policy.json` + the ledger (see `## Parent plan` in `run.md`). The two
questions below are the only genuine fork-vs-upstream product calls — both are cases where
**the fork and upstream independently built the same feature**, so neither `--ours` nor
`--theirs` is obviously right and picking wrong silently changes who gets billed or
throttled on Arena.

Please answer with `/upstream-sync resume` plus `Q1: <A|B|C>` and `Q2: <A|B|C>` on this PR.

---

## Q1 — Workflow-execution billing attribution: whose model wins?

Upstream `#5545` / `#5657` / `#5698` rebuilt execution billing attribution
(`BillingAttributionSnapshot`, `deriveBillingContext`, `ValidatedPreprocessContext`,
`workspace.billedAccountUserId`, `changeWorkspaceStoragePayerInTx`).

The fork built its **own** attribution model over the same files, independently:
`ExecutionActor` / `extractExecutionActor`, `billingUserId` threading, and the
`workflow_execution_logs_workspace_actor_user_idx` index. These are fork-authored — zero
occurrences at the merge base and zero at upstream's tip.

Measured collision on the five core files (`lib/logs/execution/logger.ts`,
`lib/billing/core/usage-log.ts`, `lib/billing/calculations/usage-monitor.ts`,
`lib/execution/preprocessing.ts`, `app/api/copilot/api-keys/validate/route.ts`):

- fork vs base: **+1096 / −142**
- upstream vs base: **+797 / −495**

This decision governs roughly **22 conflicted files** across `lib/billing/**`,
`lib/logs/execution/**`, `background/*-execution.ts`, `executor/handlers/workflow/`,
`lib/workflows/executor/execute-workflow.ts` and the execute/billing API routes.

| | Option | What it means |
|---|---|---|
| **A** | **Fork-first** | Keep the fork's `ExecutionActor` attribution as the source of truth. Take upstream's new modules additively (so the tree compiles and the `0264` schema columns land) but do **not** rewire the logger/usage-log call sites. Lowest regression risk for existing Arena usage reporting; the fork keeps diverging and this cluster re-conflicts every sync. |
| **B** | **Upstream-first** | Adopt upstream's `BillingAttributionSnapshot` model end-to-end and retire `ExecutionActor` / `extractExecutionActor` / `billingUserId`. Cheapest future syncs. **Risk:** any Arena reporting that reads `actorType` / `apiKeyId` per-execution changes shape, and the `workspace_actor_user_idx` index loses its consumer. |
| **C** | **Hybrid** | Take upstream's attribution as the billing path and keep `ExecutionActor` purely as an *observability* field written alongside it (index retained, no billing decisions read from it). More work now, keeps both signals. |

**Please confirm alongside your answer:** does anything outside this repo (a dashboard,
export, or client invoice job) read `workflow_execution_logs.actor_user_id` /
`actor_type` / `api_key_id`? If yes, B is off the table.

---

## Q2 — Copilot / Mothership usage limits: fork gate or upstream attributed gate?

`apps/sim/app/api/copilot/api-keys/validate/route.ts` is the callback the Copilot/Mothership
backend hits before serving a request. Today the fork gates it with two **fork-only**
helpers in `lib/billing/calculations/usage-monitor.ts`:

- `checkSelfHostedMothershipUsageLimits(userId)` — the `!isHosted` branch
- `checkMothershipUsageLimits(userId, workspaceId)` — the hosted branch

Neither exists at the merge base or at upstream's tip. Upstream `#5545` replaced its
equivalent with `checkAttributedUsageLimits` plus a header handshake
(`billing-protocol-v1`: `x-billing-attribution`, `x-billing-request-id`,
`x-copilot-billing-protocol`) and two new env flags:
`COPILOT_BILLING_ATTRIBUTION_V1_ENABLED` and `COPILOT_BILLING_PROTOCOL_REQUIRED`.

Governs ~10 conflicted files (`app/api/copilot/api-keys/validate/**`,
`lib/copilot/request/**`, `lib/copilot/tools/handlers/**`, `app/api/mothership/execute/`,
`lib/billing/calculations/usage-monitor.*`).

Note: the fork redefines `isHosted` (`*.thearena.ai` + `localhost:3000`), so the fork's
`isHosted` branch — not its self-hosted branch — is what actually runs on Arena production.

| | Option | What it means |
|---|---|---|
| **A** | **Fork-first** | `checkSelfHostedMothershipUsageLimits` / `checkMothershipUsageLimits` stay as the governing check. Upstream's attribution modules are taken additively so everything compiles. No behaviour change on Arena. |
| **B** | **Upstream-first** | Adopt `checkAttributedUsageLimits`; delete both fork helpers and their tests. Arena copilot limits then follow upstream's workspace-payer pool semantics. |
| **C** | **Hybrid** | Fork check runs first, upstream's attributed check runs as a second gate. Strictest; double-gates. |

**Regardless of A/B/C I plan to leave `COPILOT_BILLING_ATTRIBUTION_V1_ENABLED` and
`COPILOT_BILLING_PROTOCOL_REQUIRED` unset** — the flags are default-off upstream and Arena's
copilot backend does not send the v1 markers. Say so if Arena's copilot deployment already
speaks billing-protocol-v1 and you want them on.

---

### Context — what I did *not* ask about

For the record, these looked like questions and resolved cleanly from the codebase/ledger:

- **HubSpot (`#5635`)** — additive on both sides; upstream's edits to shared tools are 2-line
  touch-ups. Union. Only the associations response type needs reconciling.
- **Landing / SEO rewrite** — the fork already ships `/comparison` and `/library`, so
  Sim-branded marketing pages are an accepted class here. Fork-first on the four rebranded
  files only.
- **Settings IA refactor (`#5545`)** — URLs are unchanged, upstream's unified navigation
  already declares `mothership` and `recently-deleted`, and the fork's own settings
  components don't conflict. Adopting it, re-applying the fork's suppressions.
- **Migration `0260` collision** — mechanical: renumber upstream to `0264`, keep the fork's
  journal and snapshot.
- **Execution timeouts / free-tier limits (`#5640`)** — preserving the fork's `60000`
  timeouts and rate-limit defaults as status quo. Flagged as a follow-up in `run.md`.
- **Email social links (`#5653`)** — keeping the fork's suppression; upstream's
  `!isWhitelabeled` gate does not protect Arena.

## 2026-08-06-4 · PR #688

**Q** (2026-08-06T12:00:04.796Z, upstream-sync[bot]): Grill open questions must be answered before merge starts.
_Context: .upstream-sync/ledger/2026-08-06-4/open-questions.md_

## 2026-08-06-4 · PR #688

**A** (2026-08-06T12:08:11Z, utcarshsrivastava-collab): /upstream-sync resume
1. Let us go with B - if all the features of A are already included there. If not, then lets go ahead with A only. workflow_execution_logs.actor_user_id / actor_type / api_key_id is not being called anywhere else. 
2. A - we'll go with this


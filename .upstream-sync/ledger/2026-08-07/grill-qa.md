# Grill Q&A — 2026-08-07

## 2026-08-07 · PR #690

**Q** (2026-08-07T06:41:08Z, utcarshsrivastava-collab): # Open questions — upstream sync 2026-08-07 (v0.7.44 → v0.7.49, 142 commits)

Predicted merge: **89 conflicted files** (`git merge-tree` tree `de2ad423`). I self-resolved
81 of them from `merge-policy.json` + the ledger (see `## Parent plan` in `run.md`). The two
questions below are the only genuine fork-vs-upstream product calls. Both sit in the same
subject — **organization membership and workspace ownership** — and both change who owns an
Arena user's workspaces, so answering one without the other leaves the tree inconsistent.

Please answer with `/upstream-sync resume` plus `Q1: <A|B|C>` and `Q2: <A|B>` on this PR.

---

## Q1 — Workspace-creation policy: the fork's `is_personal` model or upstream's #5918 rewrite?

Both sides independently rewrote **the same `if (!isBillingEnabled)` branch** of
`evaluateWorkspaceCreationPolicy` in `apps/sim/lib/workspaces/policy.ts`. Billing is off on
Arena, so that branch is exactly the code path Arena runs — this is not a hypothetical.

**The fork's model** (commit `ccfdd45292` "Personal workspace attaching to Org", plus the
fork-authored `workspace.is_personal` column from migration `0248_workspace_is_personal.sql`):
every workspace is forced to `workspaceMode: ORGANIZATION`, and personal-ness is tracked on the
separate `is_personal` flag, computed as `!(await userHasPersonalWorkspace(userId))`. A guard
above it — `if (!isOrgAdmin && !isPersonal) → 403` — means **a plain member who already has
their personal workspace cannot create another one**.

**Upstream `#5918`** keeps the `PERSONAL` / `ORGANIZATION` mode split and adds
`observedOrganizationId`, `blockedReasonCode`, `requireOrganizationOwnerId` and a
billing-identity lock. On the billing-off path it does the opposite of the fork:
**plain members may create organization workspaces freely**, with this rationale in the diff —

> Members may create organization workspaces once billing is off. The admin-only rule exists
> because an organization workspace draws on the organization's paid seats and usage. Without
> billing there is nothing to draw on, and the rule instead produces a dead end.

Measured collision across the five governing files (`lib/workspaces/policy.ts` + test,
`app/api/workspaces/route.ts`, `lib/credentials/access.ts`, `app/invite/[id]/invite.tsx`,
`app/workspace/page.tsx`): fork vs base **+260 / −312**, upstream vs base **+466 / −108**.
Both sides *deleted* heavily, which is the signature of two rewrites rather than one rewrite
plus an addition — so neither `--ours` nor `--theirs` is defensible on the diff alone.

Governs the **8 conflicts** in the `org-workspace-policy` cluster, plus `workspace.is_personal`
and its ~20 in-tree consumers (settings API-keys and secrets UI, `lib/billing/authorization.ts`,
`lib/channel-accounts.ts`, `lib/workspaces/create-workspace.ts`, the v1 admin import route).

| | Option | What it means |
|---|---|---|
| **A** | **Fork-first** | Keep the fork's `is_personal` policy verbatim, including the one-workspace-per-member cap. Take upstream's new modules additively so the tree compiles. No behaviour change on Arena; this cluster re-conflicts every sync. |
| **B** | **Upstream-first** | Adopt #5918's policy end-to-end and retire the `is_personal` branch from the policy function. **Plain Arena members can then create additional organization workspaces**, which they currently cannot. Cheapest future syncs. The `is_personal` column stays in the schema (its other consumers keep working) but stops driving creation decisions. |
| **C** | **Hybrid** | Take upstream's policy structure (`observedOrganizationId`, the lock, the new return shape) but keep the fork's `!isOrgAdmin && !isPersonal → 403` cap on top. Most work now; preserves the current member restriction while ending the structural divergence. |

**Please confirm alongside your answer:** is the one-workspace-per-plain-member cap a
deliberate Arena rule, or a side effect of the "personal workspace attaching to org" work?
If it is deliberate, B is off the table and C is the real choice.

---

## Q2 — Upstream's join-time workspace sweep: keep it, or turn it off?

`apps/sim/lib/invitations/` has **never been touched by the fork**, so `#5918`'s sweep lands
whole through a *clean* auto-merge — no conflict markers, so no child agent would ever look at
it. It is a live behaviour change delivered by a merge that git reports as clean.

What it does: when a user accepts an organization invitation, **every workspace they own is
swept into that organization** — `organizationId` and `billedAccountUserId` are reassigned
inside the acceptance transaction. The invite page gains a disclosure notice listing the
workspaces that will move (`lib/invitations/disclosure-copy.ts`), and acceptance hard-fails
with `disclosure-outdated` if the set changed since the preview.

Why this needs a decision on Arena specifically: the fork already forces every workspace to
`workspaceMode: ORGANIZATION`, and Arena has a client-user model
(`lib/users/is-client-user.ts`, `lib/workspaces/is-admin-workspace.ts`,
`app/api/client-channel-mapping/`). A sweep that reassigns `billedAccountUserId` on a client's
workspaces changes who is billed and who can see them.

| | Option | What it means |
|---|---|---|
| **A** | **Keep the sweep** (recommended default) | Adopt #5918 as upstream shipped it, disclosure notice included. Consistent with the fork already treating everything as an org workspace. Accepting an org invite will move an Arena user's existing workspaces under that org. |
| **B** | **Disable the sweep** | Take #5918's invitation refactor for everything else but neutralise the workspace-migration step at accept time, so joining an org leaves existing workspaces where they are. Keeps today's Arena behaviour; a fork carve-out inside an actively developed upstream module, so it will need re-applying each sync. |

**Please confirm alongside your answer:** does anything outside this repo read
`workspace.organization_id` or `workspace.billed_account_user_id` for a client-facing report or
invoice? If yes, A moves rows those consumers depend on.

---

### Context — what I did *not* ask about

For the record, these looked like questions and resolved cleanly from the codebase/ledger:

- **Exa `exa_research` removal (`#6074`)** — upstream validated against the live API:
  `/research/v1` returns **HTTP 410 RESEARCH_RETIRED**, so the fork's Research operation is
  already hard-broken in production. Upstream routes saved `exa_research` workflows to the new
  Agent operation and preserves the research output shape, and its block already carries all
  four of the fork's crawl/published-date fields. Upstream-first; only the fork's
  hidden/optional `apiKey` subBlock is re-applied.
- **Router/Evaluator cost basis** — the merged tree applies the cost policy centrally in
  `providers/index.ts`, so keeping the fork's `resolveBlockModelCost` at those two call sites
  would apply the margin twice. Upstream's `cost-policy.ts` contains both of the fork helper's
  concerns, which is the condition you set on run 2026-08-06-4 Q1. Adopting upstream; the fork
  export stays for `historical-workflow-reconciliation.ts`.
- **Copilot `delete_file` / `delete_file_folder` retirement** — upstream deleted the tools with
  no replacement, and the deletion arrives silently (`delete-file.ts` vanishes, schemas
  auto-merge to zero). The fork-only `local-copilot/` still delegates both names, so restoring
  additively per the run 2026-08-06-5 precedent.
- **Enterprise self-host flags (`#6028`)** — audited: `enterprise-entitlements.ts` resolves an
  unset flag to a per-feature legacy default that reproduces prior behaviour exactly, and the
  merged `isOrganizationsEnabled` / `isAccessControlEnabled` expressions are semantically
  identical to the baseline. Nothing flips on or off for Arena.
- **Desktop app (`#5998`)** — additive; the new settings sections self-hide behind
  `requiresDesktopSurface`, so no fork suppression is needed.
- **Migration collision `0266–0269`** — mechanical: keep the fork's indices, renumber upstream's
  eleven migrations to `0270–0280`, rebuild the journal (which auto-merged into duplicate `idx`
  values again).
- **`next` 16.2.6 vs 16.2.12** — taking upstream's version per `packageJson.sharedDependencyVersions`;
  both bumps are security advisories and the fork's split pin lives in a fork-only
  `apps/sim/package.json` overrides block.
- **Landing brand strings, CI workflows, `socket-token` restore path, Turbopack build cache** —
  fork-first as status quo, all logged as follow-ups in `run.md`.

## 2026-08-07 · PR #690

**Q** (2026-08-07T06:41:32.582Z, upstream-sync[bot]): Grill open questions must be answered before merge starts.
_Context: .upstream-sync/ledger/2026-08-07/open-questions.md_


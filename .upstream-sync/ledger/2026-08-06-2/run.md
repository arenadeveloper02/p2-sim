# Upstream Sync Run — 2026-08-06-2

## Sync topology

- **Target branch:** `feat/github-merge-agent`
- **Upstream HEAD:** `207785c8`
- **Merge-base (target ↔ upstream):** `e2fecc86`
- **Analysis baseline:** `6c3d11b2` (lastSyncedUpstreamSha)
- **Commits in sync range:** 24
- **Merge tip:** next-release v0.7.30 (`207785c8`; full upstream HEAD `348caabf`)

## Grill analysis

### Shape of this slice

v0.7.30 is a **small, low-risk slice** compared to the previous runs. Measured against
baseline `6c3d11b2`:

- Upstream touched **112 files**; the fork has touched **1608** since the same baseline.
- The **overlap is only 32 files** — that is the entire conflict surface. The other 80
  upstream files land clean.
- **No `packages/db/` changes at all** — no migrations, no schema, no `_journal.json`.
  The migration-renumbering class that dominated 2026-08-05 does not exist this run.
- **No `package.json` / `bun.lock` changes** — the lockfile bootstrap is a no-op.
- **No `tools/registry.ts` / `blocks/registry*.ts` changes** — no registry union.

### Upstream FBIs in this batch

Grouped by theme (all 24 commits are in `fbi-report.md`):

**Security hardening (take unconditionally — these are the highest-value commits here):**

- `simstudioai/sim#5604` — enforce workspace write/admin permission + storage quota on
  `context === 'mothership'` uploads (`app/api/files/upload/route.ts`). Before this,
  a mothership upload only needed a session, not workspace authorization.
- `simstudioai/sim#5601` — bound request-body reads on `speech/token`,
  `knowledge/…/chunks`, and `help` routes via `readFormDataWithLimit` / stream-limits.
- `simstudioai/sim#5599` — sanitize docx hyperlink `href`s to block `javascript:` XSS.
  Moves `isAllowedExternalUrl` from `lib/pptx-renderer/utils/url-safety.ts` to
  `lib/core/security/url-safety.ts` and adds `sanitizeRenderedHyperlinks`.
- `simstudioai/sim#5600` — re-check `authType` before minting the deployment auth cookie
  in chat OTP.
- `simstudioai/sim#5613` — restrict custom-block `iconUrl` to `https:` or internal serve
  paths.

**Features:**

- `#5574` xAI added to the hosted key rotation pool + BYOK provider surface.
- `#5586` block palette opens on edge drag-release with auto-connect (`workflow.tsx`).
- `#5532` `deploy_custom_block` copilot tool + `lib/copilot/entitlements.ts` (new).
- `#5614` emcn multi-select selectors + `Wizard` reimplemented on `ChipModal`.

**Perf / polish:**

- `#5597` cap Cmd-K result groups; `#5605` Lighthouse CWV repairs (`fetchPriority`,
  cache headers, `productionBrowserSourceMaps`); `#5616` preload the Cal.com embed;
  `#5612` shimmer subagent/tool labels instead of spinners; `#5590 / #5594 / #5608 /
  #5617` rich-markdown-editor image + paste fixes; `#5592 / #5598` OG image updates.

### Fork-owned paths at risk

Only one `forkFirst` path is touched by upstream this slice:

- `apps/sim/public/logo/426-240/reverse/small.png` — upstream re-exported Sim's logo.
  `apps/sim/public/logo/` is already `forkFirst`, so this auto-resolves to ours. Correct:
  the fork ships Arena artwork there.

No other `forkFirst` prefix (Arena / P2 docs / Unipile / Facebook / Presentation / Figma /
HubSpot / mothership-admin / deploy scripts / branding) is touched.

`manualReview` paths touched: `apps/sim/app/(landing)/components/` (hero only) and
`apps/sim/app/api/mothership/` (execute route). Both are additive-both-sides unions.

### Decisions resolved without asking

**1. xAI hosted keys (`#5574`) — the fork is already a superset; take only the BYOK surface.**

The extensibility notes require auditing every `isHosted`-gated upstream addition because
`isHosted` is fork-redefined (true for `*.thearena.ai` and `localhost:3000`). Audited:

- `lib/core/config/env.ts` — fork already declares `XAI_API_KEY` **and** `_1.._3`. Ours.
- `lib/core/config/api-keys.ts` — fork already has the `xai` rotation branch plus
  `vertex`/`sambanova`/`google` and a better error message. Ours.
- `providers/utils.ts` `getApiKey` — fork already has `isXaiModel` inside the
  `isHosted && (…)` hosted gate. Ours.
- `providers/models.ts` `getHostedModels` — fork already includes
  `...getProviderModels('xai')`. Ours.

So `#5574`'s server-side behavior **already ships in the fork**; there is no new
"fork starts paying for xAI inference" exposure introduced by this merge. The genuinely
new part is the **BYOK surface** (`tools/types.ts` `BYOKProviderId`, `contracts/byok-keys.ts`
enum, `lib/api-key/byok.ts` hosted gate, `settings/…/byok.tsx` provider card) — purely
additive, take it and union with the fork's `semrush` / `browser_use` entries.
`xAIIcon` already exists at `apps/sim/components/icons.tsx:1269`, so upstream's byok.tsx
import resolves.

**2. `productionBrowserSourceMaps: true` (`#5605`) — take upstream.**

Upstream's inline rationale is explicitly premised on "this repo's source is already fully
public on GitHub". Verified that premise holds for the fork:
`gh repo view arenadeveloper02/p2-sim` → `"visibility": "PUBLIC"`. Merge policy says
upstream wins on shared infra unless the ledger says otherwise, and diverging on
`next.config.ts` would create recurring conflict surface for no confidentiality gain.

Reviewer note (not a blocker): the fork self-hosts via `scripts/deploy-ec2-local-build.sh`
and Docker, so shipping browser sourcemaps adds build time and image size that upstream's
hosted setup does not pay. If that hurts the EC2 pipeline, it is a **one-line revert** of
`productionBrowserSourceMaps` in `apps/sim/next.config.ts`; nothing else depends on it.

**3. Landing CTA constants (`#5602`) — no routing change for the fork; take upstream.**

Initially read as a customer-facing reroute. It is not: `cta.tsx`, `hero-cta.tsx`,
`navbar.tsx`, `mobile-nav.tsx`, and `enterprise.tsx` already point sales CTAs at `/demo`
in the fork's current tree — upstream only replaces the string literal `'/demo'` with the
new `DEMO_HREF` constant from `app/(landing)/constants.ts`. The only real behavior change
is on `/pricing`, where the enterprise card's `intent === 'sales'` CTA now routes to
`/demo` instead of `/signup`, which makes it consistent with every other sales CTA the
fork already ships. The fork has not touched any of these files, so they merge clean.

Pre-existing issue surfaced (NOT introduced by this sync, no action required to merge):
`apps/sim/app/(landing)/demo/components/demo-scheduler/demo-scheduler.tsx` defaults
`CAL_LINK` to `'team/sim/demo'` — Sim's calendar. It is env-overridable via
`NEXT_PUBLIC_CAL_LINK`. Arena should set that variable before relying on the demo funnel.
`#5616` only preloads whatever `CAL_LINK` already resolves to, so it neither creates nor
worsens the misroute.

**4. Fork hand-edit inside a generated file — preserve it explicitly.**

`apps/sim/lib/copilot/generated/` is `upstreamFirst` with `regenerateAfterMerge:
bun run mship:generate`. The fork carries a **one-sentence hand-edit** in both
`tool-catalog-v1.ts` and `tool-schemas-v1.ts` (Superagent `task` description: Google Docs
GFM import guidance). Confirmed by grep that this sentence exists **nowhere in any
generator source** — only in the two generated files. Also confirmed
`scripts/sync-tool-catalog.ts` reads from `../copilot/copilot/contracts/tool-catalog-v1.json`,
a **sibling repo the fork does not have**, so `bun run mship:generate` cannot regenerate
here at all.

Consequence: a plain `--theirs` would silently delete fork prompt behavior. Resolution is
`theirs` (upstream adds 117 catalog entries incl. `deploy_custom_block`) **plus a
mechanical re-apply** of the fork's sentence to the two `Superagent.task.description`
strings. Policy updated so the next sync inherits this.

**5. Trivial / mechanical.**

- `search-modal.tsx` — the fork's only delta vs baseline is a **commented-out dead
  import**. Take upstream wholesale and drop the dead comment.
- `highlight.ts` — both sides made the same semantic change (`String.raw` → plain string),
  differing only in quote style. Keep ours (single quotes match biome).
- `llms.txt` / `llms-full.txt` — take upstream's markdown-link restructuring; keep the
  fork's `Arena` branding strings. Upstream's `Mothership` → `Chat` rename in
  `llms-full.txt` matches `.claude/rules/constitution.md` ("never say Mothership"), so
  take it.

### Verified non-issues (checked so children do not re-litigate them)

- **`@sim/emcn` icon imports.** Upstream's `agent-group.tsx` imports `ChevronDown` and
  `search-modal.tsx` imports `Library` from the `@sim/emcn` barrel, while the fork imports
  icons from `@sim/emcn/icons`. `packages/emcn/src/index.ts:26` does `export * from './icons'`,
  so **both paths resolve** — this is a style-alignment nit (prefer the fork's
  `@sim/emcn/icons`), not a build break.
- **`Wizard` on `ChipModal` (`#5614`).** `WizardProps` is unchanged; only the internals swap
  `Modal` → `ChipModal`. The fork's two consumers (`slack-setup-wizard.tsx`,
  `connect-slack-bot-modal.tsx`) still type-check. Visual-regression check only.
- **`url-safety` move (`#5599`).** Every consumer of the deleted
  `lib/pptx-renderer/utils/url-safety.ts` lives inside `lib/pptx-renderer/` itself, and
  upstream updates all three import sites in the same commit. The fork has not touched any
  of them. No dangling import.
- **`lib/copilot/entitlements.ts` (new).** Its only non-package import,
  `@/lib/workflows/custom-blocks/operations`, exists in the fork; `lru-cache` is already a
  dependency (`apps/sim/package.json:173`). Compiles.
- **`ShimmerText`.** New upstream component + a `+1` line in `apps/sim/components/ui/index.ts`,
  which the fork has not touched. Clean.

### Open decisions requiring a human

**None.** Every call above resolved from `merge-policy.json`, the ledger, or direct code
inspection. See `open-questions.md`.

## Parent plan

### Self-resolutions

- **Keep Arena brand assets over upstream's Sim logo re-export** (`ours`): apps/sim/public/logo/426-240/reverse/small.png — Binary assets have no sane three-way merge and the fork ships Arena artwork. Already covered by merge-policy forkFirst. (merge-policy.forkFirst / extensibility-notes 2026-08-05 'Brand assets belong in forkFirst')
- **xAI server-side key rotation is already a fork superset — keep ours** (`ours`): apps/sim/providers/models.ts, apps/sim/providers/utils.ts, apps/sim/lib/core/config/api-keys.ts, apps/sim/lib/core/config/env.ts — Audited per the 'isHosted is fork-redefined' rule. The fork already declares XAI_API_KEY plus _1.._3, already has the xai branch in getRotatingApiKey (plus vertex/sambanova/google), already has isXaiModel inside getApiKey's isHosted gate, and already includes getProviderModels('xai') in getHostedModels. Upstream #5574's server-side half is a strict subset — taking theirs would REMOVE fork capability. (simstudioai/sim#5574 / extensibility-notes 2026-08-05 'isHosted is fork-redefined')
- **Take upstream's new xAI BYOK surface, union with fork-only BYOK providers** (`union`): apps/sim/tools/types.ts, apps/sim/lib/api/contracts/byok-keys.ts, apps/sim/lib/api-key/byok.ts, apps/sim/app/workspace/[workspaceId]/settings/components/byok/byok.tsx — Purely additive and safe: xAIIcon already exists at apps/sim/components/icons.tsx:1269, and the fork's getRotatingApiKey already supports 'xai'. (simstudioai/sim#5574)
- **Take every upstream security fix in this slice unconditionally** (`union`): apps/sim/app/api/files/upload/route.ts, apps/sim/app/api/files/upload/route.test.ts, apps/sim/app/api/help/route.ts, apps/sim/app/workspace/[workspaceId]/files/components/file-viewer/docx-preview.tsx — #5604 closes a real authz hole (mothership uploads previously needed only a session, not workspace permission). #5601, #5599, #5600, #5613 are body-bound, XSS, auth-cookie, and iconUrl hardening. (simstudioai/sim#5604, #5601, #5599, #5600, #5613 / merge-policy 'Upstream wins on shared infra (deps, CI, security)')
- **Take upstream generated copilot contracts, then re-apply the fork's Superagent addendum** (`mustEdit`): apps/sim/lib/copilot/generated/tool-catalog-v1.ts, apps/sim/lib/copilot/generated/tool-schemas-v1.ts — The fork's sentence exists in NO generator source, only in the generated output, and scripts/sync-tool-catalog.ts reads a sibling repo absent from this checkout. (merge-policy.upstreamFirst + regenerateAfterMerge / scripts/sync-tool-catalog.ts:8)
- **Take upstream's Cmd-K search modal wholesale; drop the fork's dead commented import** (`theirs`): apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/search-modal/search-modal.tsx — The fork's ONLY delta vs baseline was a commented-out import; upstream rewrites 139/91 lines for the result-group cap plus pendingConnect auto-connect wiring. (simstudioai/sim#5597, #5586)
- **Keep the fork's quoting on the identical highlight.ts change** (`ours`): apps/sim/app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/highlight.ts — Both sides made the same semantic change and differ only in quote style. The fork's single-quoted form is what biome enforces, so ours avoids a lint fixup. (simstudioai/sim#5590)
- **Take upstream's CWV/perf next.config changes including productionBrowserSourceMaps** (`union`): apps/sim/next.config.ts — Verified arenadeveloper02/p2-sim is PUBLIC, so sourcemaps expose nothing the repo does not already publish. Reviewer note: one-line revert if the EC2 build cost matters. (simstudioai/sim#5605 / merge-policy 'Upstream wins on shared infra')
- **Union landing + llms.txt: upstream structure, fork Arena branding** (`union`): apps/sim/app/(landing)/components/hero/hero.tsx, apps/docs/app/llms.txt/route.ts, apps/sim/app/llms-full.txt/route.ts — Additive-both-sides in disjoint regions. Upstream's Mothership->Chat rename matches the fork's own constitution rule. (simstudioai/sim#5605 / .claude/rules/constitution.md)
- **Take the landing CTA-constants refactor as-is (no routing change for the fork)** (`theirs`): apps/sim/app/(landing)/ — Not a customer-facing reroute — those CTAs already point at /demo in the fork; upstream only swaps the literal for DEMO_HREF. (simstudioai/sim#5602, #5616)
- **Take the 80 upstream files outside the 32-file overlap unmodified** (`theirs`): apps/docs/, apps/sim/lib/mcp/, apps/sim/lib/copilot/tools/handlers/deployment/, apps/sim/lib/pptx-renderer/, apps/sim/stores/modals/search/, packages/emcn/src/components/wizard/, packages/workflow-renderer/ — Upstream touched 112 files, the fork touched 1608 since the same baseline, intersection exactly 32. The remaining 80 merged without conflict. (FBI 2026-08-06-2 / simstudioai/sim#5599, #5614, #5532)

### Child areas

- **xai-byok-providers** `apps/sim/providers/` (`union`): `apps/sim/providers/utils.ts`, `apps/sim/providers/utils.test.ts` — BUILD BREAK TO FIX FIRST — apps/sim/providers/utils.ts declares `const isXaiModel = provider === 'xai'` TWICE (line ~1128 ours, ~1131 theirs) OUTSIDE the conflict markers; git merged both sides of an adjacent-line addition. Delete one. Then resolve the single hunk at ~1133 by KEEPING THE FORK SIDE: `if (isHosted && (isOpenAIModel || isClaudeModel || isGeminiModel || isSambaNovaModel || isXaiModel || isOpenRouterModel || isZaiModel))` plus the '// Only use server key if model is explicitly in our hosted list' comment. Upstream's narrower list drops sambanova + openrouter, which the fork's getRotatingApiKey and getHostedModels already support — taking theirs SILENTLY REMOVES fork capability. Nothing in upstream's #5574 hunk is new to the fork. utils.test.ts has 2 hunks, both union: (1) keep BOTH `shouldBillModelUsage('grok-4-latest')` (ours) and `shouldBillModelUsage('grok-4.5')` (theirs) — verified both ids exist in providers/models.ts:2014 and :2042; (2) KEEP the fork-only `expect(shouldBillModelUsage('mothership')).toBe(false)` assertion — upstream simply does not have the mothership pseudo-model. Verify with `bunx vitest run apps/sim/providers/utils.test.ts`. Related files from this area (models.ts, tools/types.ts, lib/core/config/{env,api-keys}.ts, lib/api-key/byok.ts, lib/api/contracts/byok-keys.ts, settings byok.tsx) are already resolved — do NOT reopen them.
- **api-routes-security** `apps/sim/app/api/` (`union`): `apps/sim/app/api/help/route.ts` — One hunk, import block only (lines 8-23) — the whole body below it already merged clean and is UPSTREAM's shape. Confirmed by grep: the body calls `readFormDataWithLimit` (line 47), `MAX_WORKSPACE_FORMDATA_FILE_SIZE + MAX_MULTIPART_OVERHEAD_BYTES` (line 33), `isPayloadSizeLimitError` (line 159), AND the fork's `getHelpInboxEmail()` (line 110). So the union import block is: keep `import { getHelpInboxEmail } from '@/lib/core/utils/urls'`, take upstream's `{ isPayloadSizeLimitError, MAX_MULTIPART_OVERHEAD_BYTES, readFormDataWithLimit } from '@/lib/core/utils/stream-limits'` and `MAX_WORKSPACE_FORMDATA_FILE_SIZE from '@/lib/uploads/shared/types'`, and DROP `getHelpEmailAddress` from the '@/lib/messaging/email/utils' import (fork replaced it with getHelpInboxEmail — leaving it in is an unused-import lint failure). Result: `import { getFromEmailAddress } from '@/lib/messaging/email/utils'`. Keep biome import ordering. #5601's 413 branch is mandatory and already present. files/upload/route.ts(+test) and mothership/execute/route.ts are already resolved — do NOT reopen them.
- **workspace-ui** `apps/sim/app/workspace/` (`union`): `apps/sim/app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/highlight.ts`, `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/agent-group.tsx`, `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/tool-call-item.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/selector-combobox/selector-combobox.tsx` — highlight.ts is resolved by directive (checkoutOurs) — the child only verifies no markers remain, it does not re-decide. The other three are hand-merges of upstream #5612 (ShimmerText) and #5614 (multi-select) against fork-only UI. agent-group.tsx (3 hunks): (1) import block — keep the fork's `@sim/emcn/icons` subpath with BOTH `ChevronDown` and the fork-only `PillsRing`, keep `resolveAssistantDisplayLabel` from '@/lib/chat/assistant-display-name', keep `{ cn, Expandable, ExpandableContent } from '@sim/emcn'`, and ADD upstream's `{ ShimmerText } from '@/components/ui'`. Do not adopt upstream's barrel-import of ChevronDown (both resolve — packages/emcn/src/index.ts:26 re-exports icons — but the subpath is the repo convention). (2)+(3) are the same edit in the button and non-button branches: take upstream's `isWorking ? <ShimmerText className='text-sm'>{...}</ShimmerText> : <span className='text-[var(--text-body)] text-sm'>{...}</span>` but render `resolvedAgentLabel` in BOTH slots, never `agentLabel` — dropping resolveAssistantDisplayLabel regresses the fork's assistant naming. Also preserve the fork's autoExpanded expression `isCurrentSection || (isStreaming && (isLaneOpen || !resolved))` if any adjacent edit touches it. tool-call-item.tsx (2 hunks): union — keep the fork's `const resolvedTitle = liveWorkspaceFileTitle || displayTitle` and `const hasMultipleLines = resolvedTitle.includes('\n')` AND add upstream's `const isExecuting = resolveToolDisplayState(status) === 'spinner'` (drop upstream's duplicate `title` const, it is resolvedTitle renamed). In the JSX take upstream's isExecuting ternary but feed it `resolvedTitle` and keep the fork's `whitespace-pre-line font-base` classes on the non-shimmer span; add `whitespace-pre-line` to the ShimmerText className too so multi-line titles do not regress (the outer div already switches items-start/items-center off hasMultipleLines). Confirm `resolveToolDisplayState` and `ShimmerText` imports survived the clean-merged import block. selector-combobox.tsx (1 hunk): pure union — take upstream's `selectedValues` useMemo and `handleMultiChange` useCallback verbatim, then keep the FORK's guard on the last line: `const showClearButton = clearable && Boolean(activeValue) && !disabled && !readOnly` (upstream drops `clearable &&`, which would force the clear button onto every selector). `clearable` and `multiSelect` gate independent behavior; both props stay. Verify with `bunx tsc --noEmit` scoped to apps/sim and a biome check on the three files. search-modal.tsx, workflow.tsx and the other file-viewer files are already resolved — do NOT reopen them.

Phase B finalize. 7 of the original 32 overlap files remain unmerged; 25 are resolved. No grill questions were asked or answered this run — open-questions.md records zero blockers and qa-history.jsonl has no product answers for 2026-08-06-2, so all 11 draft self-resolutions carry over unchanged (annotated with status: resolved/partial/pending). Two draft clusters (copilot-payload-generated, landing-branding-config) are fully done and moved to completedClusters with verification carry-overs. Three clusters stay active. Highest-risk item is providers/utils.ts: a duplicate `const isXaiModel` outside the conflict markers is a hard TS build break that the merge left behind, and the hunk itself is the classic 'upstream guard list is narrower than the fork's' trap. Second-highest is the ShimmerText pair in agent-group.tsx/tool-call-item.tsx, where a naive --theirs drops resolveAssistantDisplayLabel and the fork's multi-line title handling.

## Merge directives

Locked from self-resolutions; no human answers were pending this run (open-questions.md records zero blockers). Scope is ONLY the 7 paths still unmerged after the harness merge — the draft's other proposedDirectives (search-modal.tsx and lib/copilot/generated/* checkoutTheirs; logo png / providers/models.ts / lib/core/config/{api-keys,env}.ts checkoutOurs; next.config.ts / hero.tsx / files-upload / mothership-execute mustEdit) are DELIBERATELY OMITTED because those paths merged clean or were already resolved. Re-issuing them would overwrite good resolutions. checkoutOurs on highlight.ts is exact-locked: both sides made the identical semantic change and differ only in quote style; the fork's single-quoted form is what biome enforces. providers/utils.ts stays mustEdit (never --ours): the merged file currently declares `const isXaiModel` TWICE (utils.ts:1128 ours, :1131 theirs) OUTSIDE the conflict markers — that is a hard TS build break the child must dedupe on top of resolving the hunk.
- checkoutOurs: 1
- checkoutTheirs: 0
- delete: 0
- failed: 0
- mustEdit: `apps/sim/app/api/help/route.ts`, `apps/sim/providers/utils.ts`, `apps/sim/providers/utils.test.ts`, `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/agent-group.tsx`, `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/tool-call-item.tsx`, `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/selector-combobox/selector-combobox.tsx`

## Cluster xai-byok-providers

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/providers/utils.ts` | manual | Removed the duplicate isXaiModel declaration and retained the fork's wider hosted-provider guard, including SambaNova and OpenRouter, plus its hosted-model comment. |
| `apps/sim/providers/utils.test.ts` | manual | Unioned the grok-4-latest and grok-4.5 billing assertions and retained the fork-only mothership assertion. |

Resolved per the locked xai-byok-providers union directive.

## Cluster api-routes-security

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/app/api/help/route.ts` | manual | Unioned the fork's getHelpInboxEmail import with upstream's multipart size-limit imports, retained the fork's getFromEmailAddress import, and removed the obsolete getHelpEmailAddress import. |

The route body already contained both fork and upstream behavior, including the mandatory 413 payload-size response.

## Cluster workspace-ui

| File | Resolution | Notes |
| --- | --- | --- |
| `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/agent-group.tsx` | manual | Unioned ShimmerText with the fork's assistant-label resolver, @sim/emcn/icons import, PillsRing spinner, and autoExpanded behavior. |
| `apps/sim/app/workspace/[workspaceId]/home/components/message-content/components/agent-group/tool-call-item.tsx` | manual | Unioned upstream execution shimmer with the fork's live workspace-file title and multiline styling. |
| `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/selector-combobox/selector-combobox.tsx` | manual | Added upstream multi-select state and handler while retaining the fork's clearable guard. |

All assigned conflict markers are resolved. Biome passes on the three files. The scoped TypeScript check reports unrelated pre-existing repository errors and exits nonzero.

## Format

✅ `bun run format` (pre-verify autofix)

## Verification

Advisory verification failed (lint/test/check). These do not block the sync. Full `bun run build` is left to CI. Review and fix on the draft PR as needed.

### bun run check

✅ passed

```
$ turbo run format:check

   • Packages in scope: @sim/audit, @sim/auth, @sim/db, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running format:check in 21 packages
   • Remote caching disabled

::group::@sim/workflow-persistence:format:check
cache miss, executing 6a2f322f646254f4
$ biome format .
Checked 8 files in 36ms. No fixes applied.
::endgroup::
::group::@sim/auth:format:check
cache miss, executing 7b95f933c974b740
$ biome format .
Checked 3 files in 26ms. No fixes applied.
::endgroup::
::group::@sim/workflow-types:format:check
cache miss, executing d343ec897a7b120b
$ biome format .
Checked 4 files in 28ms. No fixes applied.
::endgroup::
::group::simstudio-ts-sdk:format:check
cache miss, executing e723f477a2f513f3
$ biome format .
Checked 6 files in 72ms. No fixes applied.
::endgroup::
::group::@sim/platform-authz:format:check
cache miss, executing 20bfbd17ba902713
$ biome format .
Checked 5 files in 41ms. No fixes applied.
::endgroup::
::group::@sim/runtime-secrets:format:check
cache miss, executing 54427b0fcf80d46c
$ biome format .
Checked 5 files in 44ms. No fixes applied.
::endgroup::
::group::@sim/audit:format:check
cache miss, executing 435b10fd6837457b
$ biome format .
Checked 7 files in 84ms. No fixes applied.
::endgroup::
::group::@sim/testing:format:check
cache miss, executing 6754342b8949f5f1
$ biome format .
Checked 66 files in 475ms. No fixes applied.
::endgroup::
::group::simstudio:format:check
cache miss, executing db888607b0259b5e
$ biome format .
Checked 3 files in 38ms. No fixes applied.
::endgroup::
::group::@sim/security:format:check
cache miss, executing fc2410243714aad2
$ biome format .
Checked 13 files in 73ms. No fixes applied.
::endgroup::
::group::@sim/realtime:format:check
cache miss, executing 5
```

### bun run lint

❌ failed (advisory)

```
$ turbo run lint

   • Packages in scope: @sim/audit, @sim/auth, @sim/db, @sim/emcn, @sim/logger, @sim/pii, @sim/platform-authz, @sim/realtime, @sim/realtime-protocol, @sim/runtime-secrets, @sim/security, @sim/testing, @sim/tsconfig, @sim/utils, @sim/workflow-persistence, @sim/workflow-renderer, @sim/workflow-types, docs, sim, simstudio, simstudio-ts-sdk
   • Running lint in 21 packages
   • Remote caching disabled

::group::@sim/runtime-secrets:lint
cache miss, executing 0affd3cfd3a3ca22
$ biome check --write --unsafe .
Checked 5 files in 34ms. No fixes applied.
::endgroup::
::group::simstudio:lint
cache miss, executing 3b3448794fd8d67a
$ biome check --write --unsafe .
Checked 3 files in 69ms. No fixes applied.
::endgroup::
::group::@sim/security:lint
cache miss, executing f0d899d639617b3d
$ biome check --write --unsafe .
Checked 13 files in 113ms. No fixes applied.
::endgroup::
::group::simstudio-ts-sdk:lint
cache miss, executing c86521201f82f1d8
$ biome check --write --unsafe .
Checked 6 files in 125ms. No fixes applied.
::endgroup::
::group::@sim/realtime-protocol:lint
cache miss, executing 0122da9ed0cc036d
$ biome check --write --unsafe .
Checked 5 files in 103ms. No fixes applied.
::endgroup::
::group::@sim/workflow-types:lint
cache miss, executing c5a2ba3ebbfce6a3
$ biome check --write --unsafe .
Checked 4 files in 72ms. No fixes applied.
::endgroup::
::group::@sim/logger:lint
cache miss, executing 101959f903fffb42
$ biome check --write --unsafe .
Checked 6 files in 151ms. No fixes applied.
::endgroup::
::group::@sim/utils:lint
cache miss, executing 07ed1635ff1bad02
$ biome check --write --unsafe .
Checked 22 files in 303ms. No fixes applied.
::endgroup::
::group::@sim/platform-authz:lint
cache miss, executing 5c043a9e7804d1fa
$ biome check --write --unsafe .
Checked 5 files in 66ms. No fixes applied.
::endgroup::
::group::@sim/audit:lint
cache miss, executing 176f393c5252970e
$ biome check --write --unsafe .
Checked 7 files in 140ms. No fixes applied.
::endgroup::
::group::@sim/workflow-renderer:lint
cache miss, executing 766887a777f1bb1f
$ biome check --write --unsafe .
Checked 13 files in 176ms. No fixes applied.
::endgroup::
::group::@sim/auth:lint
cache miss, executing 9430b4cb7b0f5ea1
$ biome check --write --unsafe .
Checked 3 files in 37ms. No fixes applied.
::endgroup::
::group::@sim/workflow-persistence:lint
cache miss, executing a6585cd84bdc79fc
$ biome check --write --unsafe .
Checked 8 files in 127ms. No fixes applied.
::endgroup::
::group::@sim/testing:lint
cache miss, executing 3e85379ba14ee220
$ biome check --write --unsafe .
Checked 66 files in 721ms. No fixes applied.
::endgroup::
::group::@sim/realtime:lint
cache miss, executing ed2fe0202e342b01
$ biome check --write --unsafe .
Checked 32 files in 577ms. No fixes applied.
::endgroup::
::group::@sim/emcn:lint
cache miss, executing ac892d7173f5ca3a
$ biome check --write --unsafe .
Checked 189 files in 1666ms. No fixes applied.
::endgroup::
::group::docs:lint
cache miss, executing 3ca2b0f772ab34ad
$ biome check --write --unsafe .
Checked 101 files in 1747ms. No fixes applied.
::endgroup::
::group::@sim/db:lint
cache miss, executing 5be67c93d969bd53
$ biome check --write --unsafe .
Checked 284 files in 7s. No fixes applied.
::endgroup::
[;31msim:lint[;0m
cache miss, executing 560d0558709dc093
$ biome check --write --unsafe .
app/workspace/[workspaceId]/home/components/message-content/components/special-tags/choice-blocks.ts:56:7 lint/suspicious/noShadowRestrictedNames ━━━━━━━━━━

  × Do not shadow the global "escape" property.
  
    54 │   let depth = 0
    55 │   let inString = false
  > 56 │   let escape = false
       │       ^^^^^^
    57 │ 
    58 │   for (let i = startIdx; i < text.length; i++) {
  
  i Consider renaming this variable. It's easy to confuse the origin of variables when they're named after a known global.
  

Checked 11373 files in 35s. Fixed 9 files.
Found 1 error.
check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  

error: script "lint" exited with code 1
::error::sim#lint: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run lint exited (1)
 ERROR  sim#lint: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run lint exited (1)

 Tasks:    18 successful, 19 total
Cached:    0 cached, 19 total
  Time:    36.657s 
Failed:    sim#lint

 ERROR  run failed: command  exited (1)
error: script "lint" exited with code 1

```

### bun run test

❌ failed (advisory)

```
T_KEY in your environment.%0A ❯ getBlobServiceClient lib/uploads/providers/blob/client.ts:97:11%0A ❯ Module.uploadToBlob lib/uploads/providers/blob/client.ts:142:29%0A ❯ lib/uploads/providers/blob/client.test.ts:130:22%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/uploads/providers/blob/client.ts,title=lib/uploads/providers/blob/client.test.ts > Azure Blob Storage Client > downloadFromBlob > should download a file from Azure Blob Storage,line=97,column=11::Error: Azure Blob Storage credentials are missing – set AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in your environment.%0A ❯ getBlobServiceClient lib/uploads/providers/blob/client.ts:97:11%0A ❯ Module.downloadFromBlob lib/uploads/providers/blob/client.ts:315:25%0A ❯ lib/uploads/providers/blob/client.test.ts:158:22%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/uploads/providers/blob/client.test.ts,title=lib/uploads/providers/blob/client.test.ts > Azure Blob Storage Client > downloadFromBlob > should destroy the opened stream when content length exceeds the limit,line=177,column=69::AssertionError: expected [Function] to throw error including 'storage download exceeds maximum size' but got 'Azure Blob Storage credentials are mi…'%0A%0AExpected: "storage download exceeds maximum size"%0AReceived: "Azure Blob Storage credentials are missing – set AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in your environment."%0A%0A ❯ lib/uploads/providers/blob/client.test.ts:177:69%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/uploads/providers/blob/client.ts,title=lib/uploads/providers/blob/client.test.ts > Azure Blob Storage Client > deleteFromBlob > should delete a file from Azure Blob Storage,line=97,column=11::Error: Azure Blob Storage credentials are missing – set AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in your environment.%0A ❯ getBlobServiceClient lib/uploads/providers/blob/client.ts:97:11%0A ❯ Module.deleteFromBlob lib/uploads/providers/blob/client.ts:483:25%0A ❯ lib/uploads/providers/blob/client.test.ts:190:7%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/uploads/providers/blob/client.ts,title=lib/uploads/providers/blob/client.test.ts > Azure Blob Storage Client > getPresignedUrl > should generate a presigned URL for Azure Blob Storage,line=97,column=11::Error: Azure Blob Storage credentials are missing – set AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in your environment.%0A ❯ getBlobServiceClient lib/uploads/providers/blob/client.ts:97:11%0A ❯ Module.getPresignedUrl lib/uploads/providers/blob/client.ts:183:29%0A ❯ lib/uploads/providers/blob/client.test.ts:202:22%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/auth/oauth/token/route.test.ts,title=app/api/auth/oauth/token/route.test.ts > OAuth Token API Routes > POST handler > should return access token successfully,line=63,column=31::AssertionError: expected 401 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 401%0A%0A ❯ app/api/auth/oauth/token/route.test.ts:63:31%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/auth/oauth/token/route.test.ts,title=app/api/auth/oauth/token/route.test.ts > OAuth Token API Routes > POST handler > should handle workflowId for server-side authentication,line=98,column=31::AssertionError: expected 401 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 401%0A%0A ❯ app/api/auth/oauth/token/route.test.ts:98:31%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/auth/oauth/token/route.test.ts,title=app/api/auth/oauth/token/route.test.ts > OAuth Token API Routes > GET handler > should return access token successfully,line=334,column=31::AssertionError: expected 401 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 401%0A%0A ❯ app/api/auth/oauth/token/route.test.ts:334:31%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > returns 499 when a non-SSE execution is cancelled by client disconnect,line=307,column=29::AssertionError: expected 500 to be 499 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 499%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:307:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > rejects large MCP bridge outputs instead of returning large-value refs,line=340,column=29::AssertionError: expected 500 to be 413 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 413%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:340:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > does not trust client-spoofed MCP bridge headers on API key executions,line=380,column=29::AssertionError: expected 500 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:380:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > keeps trusted internal MCP bridge executions on the JSON envelope path,line=415,column=29::AssertionError: expected 500 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:415:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/app/api/workflows/[id]/execute/route.async.test.ts,title=app/api/workflows/[id]/execute/route.async.test.ts > workflow execute async route > preserves authenticated-user actor semantics for trusted MCP bridge calls,line=459,column=29::AssertionError: expected 500 to be 200 // Object.is equality%0A%0A- Expected%0A+ Received%0A%0A- 200%0A+ 500%0A%0A ❯ app/api/workflows/[id]/execute/route.async.test.ts:459:29%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts,title=lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts > handleEditOperation nestedNodes merge > updates inputs on matched children without changing their ID,line=313,column=48::AssertionError: expected undefined to be 'New prompt' // Object.is equality%0A%0A- Expected:%0A"New prompt"%0A%0A+ Received:%0Aundefined%0A%0A ❯ lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts:313:48%0A%0A

::error file=/home/runner/work/p2-sim/p2-sim/apps/sim/lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts,title=lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts > handleEditOperation nestedNodes merge > recursively updates an existing nested loop and preserves grandchild IDs,line=357,column=70::AssertionError: expected undefined to be 'Updated prompt' // Object.is equality%0A%0A- Expected:%0A"Updated prompt"%0A%0A+ Received:%0Aundefined%0A%0A ❯ lib/copilot/tools/server/workflow/edit-workflow/operations.test.ts:357:70%0A%0A
error: script "test" exited with code 1
::error::sim#test: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run test exited (1)
 ERROR  sim#test: command (/home/runner/work/p2-sim/p2-sim/apps/sim) /home/runner/.bun/bin/bun run test exited (1)

 Tasks:    9 successful, 10 total
Cached:    0 cached, 10 total
  Time:    8m55.454s 
Failed:    sim#test

 ERROR  run failed: command  exited (1)
error: script "test" exited with code 1

```

## Merge policy

{
  "strategy": "fork-first",
  "description": "Only paths listed in forkFirst (auto --ours) or upstreamFirst (auto --theirs) are resolved without an agent. Everything else — whether or not it appears in manualReview — is agent-reviewed. manualReview is a non-exhaustive hint list of known hard shared hotspots, not a closed set. unionPaths are agent-reviewed: keep fork-only symbols and take upstream additions; never drop upstream exports that in-tree consumers import. package.json is union-merged (upstream base + fork-only scripts/deps). bun.lock is regenerated after manifests. Agents SHOULD extend this file when they learn a recurring rule (add a forkFirst/upstreamFirst/manualReview/unionPaths prefix or packageJson.dropScripts entry) so the next sync is cheaper. CAVEAT on upstreamFirst apps/sim/lib/copilot/generated/: auto --theirs is correct for the bulk, but the fork carries a hand-edit there (Superagent task description, Google Docs GFM guidance) that exists in NO generator source, and `bun run mship:generate` cannot regenerate in this checkout because scripts/sync-tool-catalog.ts reads a sibling repo (../copilot/) the fork does not have. Every sync must re-apply that sentence via a mustEdit directive after resolving theirs.",
  "packageJson": {
    "strategy": "union",
    "dropScripts": ["dev:full:minimal-registry"]
  },
  "forkFirst": [
    "apps/sim/tools/arena/",
    "apps/sim/tools/arena-development/",
    "apps/sim/app/api/tools/arena/",
    "apps/sim/app/api/arena/",
    "apps/sim/lib/arena-utils/",
    "apps/sim/blocks/blocks/arena.ts",
    "apps/sim/blocks/blocks/arena-development.ts",
    "apps/sim/hooks/queries/arena-clients.ts",
    "apps/sim/app/arenaMixpanelEvents/",
    "apps/sim/public/arena-ai-docs/",
    "apps/sim/app/api/help/arena-help/",
    "apps/sim/tools/p2_docs/",
    "apps/sim/blocks/blocks/p2_docs.ts",
    "apps/sim/lib/hubspot/",
    "apps/sim/app/api/hubspot/",
    "apps/sim/tools/unipile/",
    "apps/sim/app/api/tools/unipile/",

## Usage

### Usage (stack rollup)

- **This slice:** $6.7442 · 18,596,085 in / 131,297 out · 6 agent(s)
- **Prior stack:** $1.3515 · 3,551,008 in / 38,940 out · 2 agent(s)
- **Whole stack:** $8.0957 · 22,147,093 in / 170,237 out · 8 agent(s)

### parent-grill-analysis
- **Model:** `claude-opus-5`
- **Iterations:** 1
- **Input tokens (direct):** 1,589
- **Input tokens (cache read):** 5,300,734
- **Input tokens (cache create):** 159,298
- **Input tokens (total):** 5,461,621
- **Output tokens:** 48,246
- **Cost:** $4.862995 (provider-reported)
### parent-finalize-plan
- **Model:** `claude-opus-5`
- **Iterations:** 1
- **Input tokens (direct):** 7,407
- **Input tokens (cache read):** 1,019,003
- **Input tokens (cache create):** 71,719
- **Input tokens (total):** 1,098,129
- **Output tokens:** 19,754
- **Cost:** $1.491204 (provider-reported)
### child-xai-byok-providers
- **Model:** `gpt-5.6-luna`
- **Iterations:** 1
- **Input tokens (direct):** 60,727
- **Input tokens (cache read):** 909,906
- **Input tokens (cache create):** 0
- **Input tokens (total):** 970,633
- **Output tokens:** 7,959
- **Cost:** $0.039894 (estimated fallback)
### child-api-routes-security
- **Model:** `gpt-5.6-luna`
- **Iterations:** 1
- **Input tokens (direct):** 50,638
- **Input tokens (cache read):** 275,583
- **Input tokens (cache create):** 0
- **Input tokens (total):** 326,221
- **Output tokens:** 3,896
- **Cost:** $0.020314 (estimated fallback)
### child-workspace-ui
- **Model:** `gpt-5.6-luna`
- **Iterations:** 1
- **Input tokens (direct):** 83,015
- **Input tokens (cache read):** 1,628,567
- **Input tokens (cache create):** 0
- **Input tokens (total):** 1,711,582
- **Output tokens:** 16,638
- **Cost:** $0.069140 (estimated fallback)
### child-finalize-merge
- **Model:** `gpt-5.6-luna`
- **Iterations:** 1
- **Input tokens (direct):** 213,107
- **Input tokens (cache read):** 8,814,792
- **Input tokens (cache create):** 0
- **Input tokens (total):** 9,027,899
- **Output tokens:** 34,804
- **Cost:** $0.260682 (estimated fallback)

### Totals
- **Total input tokens:** 18,596,085
- **Total output tokens:** 131,297
- **Primary models:** claude-opus-5, gpt-5.6-luna
- **Total cost:** $6.744229
- **Provider-reported cost:** $6.354199
- **Estimated cost (fallback):** $0.390030

### Cost by agent
- **parent-grill-analysis:** $4.862995 (provider-reported)
- **parent-finalize-plan:** $1.491204 (provider-reported)
- **child-xai-byok-providers:** $0.039894 (estimated fallback)
- **child-api-routes-security:** $0.020314 (estimated fallback)
- **child-workspace-ui:** $0.069140 (estimated fallback)
- **child-finalize-merge:** $0.260682 (estimated fallback)


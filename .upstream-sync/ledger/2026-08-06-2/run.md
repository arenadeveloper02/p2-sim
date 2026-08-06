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


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

- **Keep Arena brand assets over upstream's Sim logo re-export** (`ours`): apps/sim/public/logo/426-240/reverse/small.png — Binary assets have no sane three-way merge and the fork ships Arena artwork. Already covered by merge-policy forkFirst; listed so the child does not second-guess it. (merge-policy.forkFirst / extensibility-notes 2026-08-05 'Brand assets belong in forkFirst')
- **xAI server-side key rotation is already a fork superset — keep ours** (`ours`): apps/sim/providers/models.ts, apps/sim/providers/utils.ts, apps/sim/lib/core/config/api-keys.ts, apps/sim/lib/core/config/env.ts — Audited per the 'isHosted is fork-redefined' rule. The fork already declares XAI_API_KEY plus _1.._3, already has the xai branch in getRotatingApiKey (plus vertex/sambanova/google), already has isXaiModel inside getApiKey's isHosted gate, and already includes getProviderModels('xai') in getHostedModels. Upstream #5574's server-side half is a strict subset — taking theirs would REMOVE fork capability (sambanova/vertex rotation, XAI_API_KEY fallback, the better error message). (simstudioai/sim#5574 / extensibility-notes 2026-08-05 'isHosted is fork-redefined')
- **Take upstream's new xAI BYOK surface, union with fork-only BYOK providers** (`union`): apps/sim/tools/types.ts, apps/sim/lib/api/contracts/byok-keys.ts, apps/sim/lib/api-key/byok.ts, apps/sim/app/workspace/[workspaceId]/settings/components/byok/byok.tsx — Purely additive and safe: xAIIcon already exists at apps/sim/components/icons.tsx:1269, and the fork's getRotatingApiKey already supports 'xai', so the new hosted-gate path resolves. (simstudioai/sim#5574)
- **Take every upstream security fix in this slice unconditionally** (`union`): apps/sim/app/api/files/upload/route.ts, apps/sim/app/api/files/upload/route.test.ts, apps/sim/app/api/help/route.ts, apps/sim/app/workspace/[workspaceId]/files/components/file-viewer/docx-preview.tsx — #5604 closes a real authz hole (mothership uploads previously needed only a session, not workspace permission). #5601, #5599, #5600, #5613 are body-bound, XSS, auth-cookie, and iconUrl hardening. Merge policy gives upstream shared-infra security by default and nothing in the ledger says otherwise. (simstudioai/sim#5604, #5601, #5599, #5600, #5613 / merge-policy 'Upstream wins on shared infra (deps, CI, security)')
- **Take upstream generated copilot contracts, then re-apply the fork's Superagent addendum** (`mustEdit`): apps/sim/lib/copilot/generated/tool-catalog-v1.ts, apps/sim/lib/copilot/generated/tool-schemas-v1.ts — The path is upstreamFirst with regenerateAfterMerge, but two facts break that assumption: (1) grep confirms the fork's sentence exists in NO generator source, only in the generated output; (2) scripts/sync-tool-catalog.ts reads ../copilot/copilot/contracts/tool-catalog-v1.json, a sibling repo absent from this checkout, so `bun run mship:generate` cannot regenerate here. A plain --theirs would silently delete fork prompt behavior with no way to restore it. (merge-policy.upstreamFirst + regenerateAfterMerge / scripts/sync-tool-catalog.ts:8)
- **Take upstream's Cmd-K search modal wholesale; drop the fork's dead commented import** (`theirs`): apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/search-modal/search-modal.tsx — The fork's ONLY delta vs baseline in this file is a single commented-out `// import { searchItems } ...` line. Upstream rewrites 139/91 lines for the result-group cap plus pendingConnect auto-connect wiring. Keeping the dead comment has zero value and the fork has not touched stores/modals/search or search-modal/utils.ts, so the surrounding cluster merges clean. (simstudioai/sim#5597, #5586)
- **Keep the fork's quoting on the identical highlight.ts change** (`ours`): apps/sim/app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/highlight.ts — Both sides made the same semantic change (String.raw`...` to a plain string literal) in the same line; they differ only in quote style. The fork's single-quoted form is what biome enforces, so ours avoids a lint fixup. (simstudioai/sim#5590)
- **Take upstream's CWV/perf next.config changes including productionBrowserSourceMaps** (`union`): apps/sim/next.config.ts — Upstream's stated premise for productionBrowserSourceMaps is 'this repo's source is already fully public on GitHub'. Verified for the fork: `gh repo view arenadeveloper02/p2-sim` returns visibility PUBLIC, so sourcemaps expose nothing the repo does not already publish. Merge policy gives upstream shared infra, and diverging on next.config.ts would create recurring conflict surface. Reviewer note: the fork self-hosts via scripts/deploy-ec2-local-build.sh, so if sourcemap build time / image size hurts the EC2 pipeline this is a one-line revert. (simstudioai/sim#5605 / merge-policy 'Upstream wins on shared infra')
- **Union landing + llms.txt: upstream structure, fork Arena branding** (`union`): apps/sim/app/(landing)/components/hero/hero.tsx, apps/docs/app/llms.txt/route.ts, apps/sim/app/llms-full.txt/route.ts — Additive-both-sides in disjoint regions. Upstream's Mothership->Chat rename in llms-full.txt matches the fork's own constitution rule ('Never say Mothership or copilot'), so taking it is strictly correct for the fork too. (simstudioai/sim#5605 / .claude/rules/constitution.md)
- **Take the landing CTA-constants refactor as-is (no routing change for the fork)** (`theirs`): apps/sim/app/(landing)/ — Verified this is NOT a customer-facing reroute: cta.tsx, hero-cta.tsx, navbar.tsx, mobile-nav.tsx and enterprise.tsx already point sales CTAs at /demo in the fork's tree — upstream only swaps the literal '/demo' for the new DEMO_HREF constant. The one real behavior change is /pricing routing its intent==='sales' card to /demo instead of /signup, which makes it consistent with every other sales CTA the fork already ships. The fork has touched none of these files, so they merge clean. (simstudioai/sim#5602, #5616)
- **Take the 80 upstream files outside the 32-file overlap unmodified** (`theirs`): apps/docs/, apps/sim/lib/mcp/, apps/sim/lib/copilot/tools/handlers/deployment/, apps/sim/lib/pptx-renderer/, apps/sim/stores/modals/search/, packages/emcn/src/components/wizard/, packages/workflow-renderer/ — Measured: upstream touched 112 files, the fork touched 1608 since the same baseline, and the intersection is exactly 32. The remaining 80 have no fork-side edits and merge without conflict. Verified no dangling imports from the pptx-renderer url-safety move, unchanged WizardProps for the fork's two Wizard consumers, and that lib/copilot/entitlements.ts's only app import (lib/workflows/custom-blocks/operations) plus lru-cache both exist in the fork. (FBI 2026-08-06-2 / simstudioai/sim#5599, #5614, #5532)

### Child areas

- **xai-byok-providers** `apps/sim/providers/` (`union`): area-level (files assigned after merge) — Area-level; real files assigned in Phase B. Covers providers/models.ts, providers/utils.ts, providers/*.test.ts, tools/types.ts, lib/core/config/{env,api-keys}.ts, lib/core/utils.test.ts, lib/api/contracts/byok-keys.ts, lib/api-key/byok.ts, settings/components/byok/byok.tsx. TRAP: the fork is a strict SUPERSET of upstream on server-side rotation (sambanova/vertex/google branches, XAI_API_KEY fallback, xai already in getHostedModels and in getApiKey's isHosted gate). Never let upstream's narrower guard list or getHostedModels overwrite ours. Only the BYOK-surface additions are new.
- **api-routes-security** `apps/sim/app/api/` (`union`): area-level (files assigned after merge) — Area-level. Covers files/upload/route.ts(+test), help/route.ts, mothership/execute/route.ts. Upstream's authz + quota + body-bound hardening is MANDATORY (see selfResolutions). Fork state that must survive: org-logos context + isOrganizationAdminOrOwner + generateOrgLogoFileKey, image-fusion validation, validateExecutionContextUpload, getHelpInboxEmail (replaces getHelpEmailAddress), checkMothershipUsageLimits 402 branch, and copilotBackend threading. In mothership/execute merge upstream's `entitlements` into the fork's Promise.all destructure — the array order and the destructure must stay in sync.
- **copilot-payload-generated** `apps/sim/lib/copilot/` (`union`): area-level (files assigned after merge) — Area-level. Covers chat/payload.ts, chat/payload.test.ts, chat/post.ts, generated/*. Take upstream's entitlements param + spread in buildCopilotRequestPayload; keep the fork's fileAttachments mapping and the isAdminWorkspace/isAdminWorkspaceOnlyTool filter in buildIntegrationToolSchemasUncached. For generated/: resolve --theirs then re-apply the Superagent GFM sentence to BOTH files. Do NOT run `bun run mship:generate` — its generator reads a sibling repo that does not exist here; verify by grep for 'Drive handles GFM import' instead.
- **workspace-ui** `apps/sim/app/workspace/` (`union`): area-level (files assigned after merge) — Area-level. Covers w/[workflowId]/workflow.tsx, selector-combobox.tsx, home/.../agent-group.tsx, tool-call-item.tsx, sidebar/.../search-modal.tsx, files/.../file-viewer/*. agent-group.tsx is the delicate one: keep the fork's resolveAssistantDisplayLabel and the fork's autoExpanded expression (isCurrentSection || (isStreaming && (isLaneOpen || !resolved))), take upstream's ShimmerText treatment, and render resolvedAgentLabel — NOT agentLabel — inside ShimmerText. selector-combobox.tsx: union the fork's `clearable` prop with upstream's `multiSelect` prop; both gate showClearButton/selectedValues independently. Prefer the fork's @sim/emcn/icons import path over upstream's barrel import (both resolve — packages/emcn/src/index.ts:26 re-exports icons — so this is style, not a build break).
- **landing-branding-config** `apps/sim/app/(landing)/` (`union`): area-level (files assigned after merge) — Area-level. Covers (landing)/components/hero/hero.tsx, apps/sim/next.config.ts, apps/docs/app/llms.txt/route.ts, apps/sim/app/llms-full.txt/route.ts. Every 'Arena' string is fork-owned and must survive; every upstream perf/structural change is taken. Small cluster — the rest of (landing)/ has no fork-side edits this slice.

Small slice: no packages/db changes (no migrations, no schema, no _journal.json), no package.json/bun.lock changes (lockfile bootstrap is a no-op), and no tools/blocks registry changes. Conflict surface is exactly the 32-file overlap between upstream's 112 changed files and the fork's 1608. No open questions — every call resolved from merge-policy, the ledger, or direct code inspection. merge-policy.json was extended this run with the measured additive-both-sides hotspots so the next sync inherits them.


# Skipped Upstream Changes — 2026-08-06-5

Changes from simstudioai/sim we deliberately did not take during this sync.

### 2026-08-06 — simstudioai/sim#5410 — feat(mothership): mixture of models, search agent, persistent subagents, fork chat, inline questions (mothership v0.8)

- **Reason skipped:** The generated-contract refresh removes seven fork-consumed entries (Superagent, Research, UserMemory, MoveFile, MoveFileFolder, RenameFile, and RenameFileFolder). The fork still routes these tools, and UserMemory is backed by the fork-only local copilot table.
- **What we miss:** The upstream removal itself; upstream's Search and query-user-table additions were retained additively. The four additional fork workflow/file entries (CreateFileFolder, ListFileFolders, MoveWorkflow, and RenameWorkflow) were also restored because fork handlers still expose them.

### 2026-08-06 — coherence pass — preserve fork persistence exports

- **Reason skipped:** The upstream deployment-operation refactor removed the fork-facing `deployWorkflow` and `activateWorkflowVersion` exports from the policy-marked union file `apps/sim/lib/workflows/persistence/utils.ts`. They remain part of the fork surface, so the exports were restored alongside upstream's snapshot loading, operation status, and webhook-claim handling.
- **What we miss:** The upstream removal of those compatibility exports; no upstream deployment-state-machine code was discarded.

### 2026-08-06 — simstudioai/sim#5735 — fix(mothership): bug fixes

- **Reason skipped:** Keep the fork's Arena branding for hosted-key and email-description notes while taking upstream's conditional hosted-key behavior.
- **What we miss:** The Sim-branded wording, which is not appropriate for the Arena fork.

### 2026-08-06 — simstudioai/sim#5410 — feat(mothership): mixture of models, search agent, persistent subagents, fork chat, inline questions (mothership v0.8)

- **Reason skipped:** Preserve fork-owned Arena chat behavior where it overlaps upstream's alternative presentation: the colored live-status indicator, status-aware tool-row layout, HubSpot/shared-environment integration presence, and Arena-branded payload assertions. The upstream question tag, stream pacing, and compaction additions were retained additively.
- **What we miss:** Upstream's `ThinkingLoader` presentation and plain OAuth-only workspace-integration listing; the fork-specific behavior remains required by Arena.

### 2026-08-06 — simstudioai/sim#5853 — billing attribution test rewrite

- **Reason skipped:** The upstream Copilot and preprocessing assertions make `checkAttributedUsageLimits` / `resolveSystemBillingAttribution` the governing path. The settled Q&A requires the fork's `checkMothershipUsageLimits` / `checkSelfHostedMothershipUsageLimits` gate and retains `ExecutionActor` observability, so those upstream-only helper-call assertions were not transplanted.
- **What we miss:** The upstream-only helper-call assertions; compatible protocol, immutable `BillingAttributionSnapshot`, actor, and reservation coverage remains in the resolved tests.

### 2026-08-06 — simstudioai/sim#5728 — feat(storage): native Google Cloud Storage support for self-hosting

- **Reason skipped:** Preserve the fork's `isStorageContextConfigured` local-storage result so agent-generated-images requests without configured cloud storage continue through the fork's local serving path. The upstream GCS branches and cloud configuration checks were retained.
- **What we miss:** Upstream's local-provider `true` fallback for the generic context check; the fork's local agent-image behavior remains required.

### 2026-08-06 — simstudioai/sim#5857 — improvement(auth): bump better-auth to 1.6.23 and add trusted-proxy client IP resolution

- **Reason skipped:** Retain the fork's Arena trusted origins, local embed callback origins, Arena hub origin, and cross-subdomain cookie domain while taking upstream's `trustedProxies` support and guarded database adapter.
- **What we miss:** Upstream's removal of the Arena-specific trusted-origin and cross-subdomain-cookie behavior.

### 2026-08-06 — simstudioai/sim#5723 — fix(oauth): coalesce slack token refresh per installation and preserve provider refresh errors

- **Reason skipped:** Keep the fork's five-argument `refreshOAuthToken` call inside upstream's installation-scoped Slack refresh chain so organization-scoped custom OAuth apps continue to resolve their credentials.
- **What we miss:** Upstream's reduced two-argument refresh call; the installation lock, freshest-chain reuse, and fan-out behavior are retained.

### 2026-08-06 — simstudioai/sim#5737 — fix(oauth): serialize version-guard date in slack fan-out sql

- **Reason skipped:** Preserve the fork's custom-app alias, organization, and resolver arguments while retaining upstream's serialized chain-version guard and conditional fan-out writes.
- **What we miss:** None of the Slack chain-safety change; only the upstream call-site shape is not used because it drops org-scoped custom OAuth app context.

### 2026-08-06 — simstudioai/sim#5800 — improvement(slack): merge slack_v2 auth into one credential picker for accounts and custom bots

- **Reason skipped:** Keep the fork's admin-gated shared Unipile and HubSpot account options, reconnect actions, and additional connect targets while adopting upstream's `service-account`/`any` picker, service-account setup modal, and preview gate.
- **What we miss:** Upstream's simplified picker path without the fork-specific shared-account and reconnect controls.

### 2026-08-06 — simstudioai/sim#5703 — chore(tiktok): simplify to draft-only Content Posting

- **Reason skipped:** Keep the fork's responseData-aware `json`/`text` transform wrapper so transforms receive the already-parsed response without consuming the buffered response a second time. Upstream's response-body stream exposure was retained additively.
- **What we miss:** Upstream's direct `response.json()` / `response.text()` wrapper implementation; the fork's parsed-response behavior remains required for existing transforms.

### 2026-08-06 — simstudioai/sim#5858 — feat(sidebar): add Slack Community link to help dropdown

- **Reason skipped:** Keep the fork's Arena documentation handler and brand-gated support, terms, and privacy items; the upstream Slack destination points to Sim's community and is not appropriate for the Arena fork.
- **What we miss:** The Slack Community help-menu item and its click event producer; the `slack_community_opened` event type is retained for type compatibility.

### 2026-08-06 — simstudioai/sim#5875 — improvement(tests+ci): phase 3 — shared-mock convergence and CI runner-minute cuts

- **Reason skipped:** Preserve the fork's post-0248 organization-attached workspace policy assertions and invite semantics; upstream's standalone-personal-workspace assertions describe a different policy model.
- **What we miss:** Upstream's standalone personal-workspace test cases; its shared database-mock migration was retained additively.

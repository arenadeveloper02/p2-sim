# Skipped Upstream Changes — 2026-08-06-4

Changes from simstudioai/sim we deliberately did not take during this sync.

### 2026-08-06 — simstudioai/sim#5640 — improvement(concurrency): limits configurable, docs updates (#5640)

- **Reason skipped:** Fork-first Arena configuration retains `DISABLE_EXECUTION_RATE_LIMIT`, the fork's free sync/async defaults, and every `EXECUTION_TIMEOUT_*` default of `60000`; upstream's unset/configurable timeout defaults were not adopted because they would materially reduce Arena execution timeouts.
- **What we miss:** Upstream's billing-disabled opt-in semantics for free-tier limits and its `300`/`5400`-second free timeout defaults; `RATE_LIMIT_FREE_API_ENDPOINT` and the accompanying documentation were retained.

### 2026-08-06 — simstudioai/sim#5545 — feat(platform): settings permissions, admin, billing attribution (#5545)

- **Reason skipped:** The upstream `0260_snapshot.json` is not retained as a separate snapshot because its migration collides with the fork's `0260`; the upstream SQL was renumbered verbatim to `0264` and the fork's `0260` snapshot remains authoritative.
- **What we miss:** The upstream snapshot metadata at its original `0260` name; the schema additions and index are preserved in `schema.ts`, `0264_unknown_sinister_six.sql`, and the journal entry.

### 2026-08-06 — simstudioai/sim#5657 and #5698 — billing attribution changes

- **Reason skipped:** Fork-first policy retains the fork's `ExecutionActor`, `billingUserId`, and actor usage-limit paths as the source of truth; upstream payer-attribution rewiring of those call sites was not adopted.
- **What we miss:** Upstream callback-time actor/payer rewiring and exact-context logger, usage-log, and preprocessing call-site behavior; additive billing snapshots and protocol compatibility were retained where required.

### 2026-08-06 — simstudioai/sim#5545 — Copilot attributed admission path

- **Reason skipped:** Q2 is locked to fork-first. The upstream `checkAttributedUsageLimits` / attributed admission path was not made the governing validate gate; the fork's `checkSelfHostedMothershipUsageLimits` and `checkMothershipUsageLimits` remain authoritative, including fork 402, TraceAttr, and member-scope behavior.
- **What we miss:** Upstream payer-pool/member-limit semantics as the primary Copilot/Mothership callback decision and its protocol-required behavior. Billing protocol header parsing, response material, and immutable attribution plumbing were retained additively; both flags remain unset so markerless legacy traffic continues to work.

### 2026-08-06 — simstudioai/sim#5545 — Settings navigation and billing shell

- **Reason skipped:** The fork retains Arena settings copy and renderer-only sections, suppresses SSO, workspace forks, data drains, and credential-set navigation, and keeps `/settings/integrations` on the fork-owned integrations surface while adopting upstream's unified host-aware shell.
- **What we miss:** Upstream's integrations redirect and its unified navigation labels for the fork-suppressed sections; the fork's billing-usage, usage, OAuth-app, and Arena API-key surfaces remain authoritative.

### 2026-08-06 — simstudioai/sim#5678 — feat(billing): allow programmatic workflow execution on the free plan

- **Reason skipped:** The fork's free-API deployment/embed gate was an orphaned Arena-only check after upstream deleted its entitlement helper; SR8 removes the gate and its imports while retaining deployed-chat image access and first-party-origin detection.
- **What we miss:** Upstream's free-plan programmatic execution behavior is not adopted as a chat embed gate; Arena chat keeps its fork-owned auth and image behavior.

### 2026-08-06 — simstudioai/sim#5568 — feat(instagram): add Instagram integration

- **Reason skipped:** The fork's connect-draft follow-up preserves a user-chosen display name when an existing draft is refreshed; the upstream upsert would overwrite it with the generated provider name.
- **What we miss:** Existing drafts do not refresh their generated display name on every connect click; TTL and all Instagram OAuth behavior are retained.

### 2026-08-06 — simstudioai/sim#5545 — feat(platform): settings permissions, admin, billing attribution (#5545)

- **Reason skipped:** The whitelabel settings keep the fork's organization-scoped upload path and favicon controls instead of upstream's workspace-logo lookup; the upstream host-aware organization prop and billing shell are retained.
- **What we miss:** Upstream's workspace selection for logo uploads; organization-scoped branding remains the authoritative Arena path.

### 2026-08-06 — simstudioai/sim#5684 — feat(landing): compare footer column, sales solutions page, nav reshuffle, scheduled-tasks calendar hero (#5684)

- **Reason skipped:** The upstream `SimWordmark` and `Sim home` footer branding were rejected in favor of the fork's `ArenaWordmark` and Arena accessibility label; the upstream `ALL_COMPETITORS` compare column and footer links were retained.
- **What we miss:** Sim-branded footer identity, which is not valid for the Arena landing page.

### 2026-08-06 — simstudioai/sim#5689 — improvement(landing): SEO copy and metadata rewrite across marketing pages (#5689)

- **Reason skipped:** Sim-branded hero/features copy and the `HOME_PAGE_DESCRIPTION`-driven metadata values were rejected; Arena's literal metadata descriptions and brand copy remain authoritative while the non-brand SEO wording and JSON-LD structure were retained.
- **What we miss:** Upstream's shared Sim canonical-description wiring and Sim-branded marketing copy.

### 2026-08-06 — simstudioai/sim#5653 — feat(community): replace Discord community links with Slack across app, docs, emails, and readme (#5653)

- **Reason skipped:** The fork intentionally suppresses transactional-email social links because the upstream `!isWhitelabeled` guard does not fire in Arena; taking the upstream row would expose Sim's community links in Arena emails.
- **What we miss:** Upstream's Slack community link replacement in the suppressed email social row.

### 2026-08-06 — simstudioai/sim#5654 — feat(community): add /linkedin redirect and route email footer LinkedIn through it (#5654)

- **Reason skipped:** The fork keeps the transactional-email social row suppressed, so the upstream LinkedIn redirect wiring is not adopted into the Arena email footer.
- **What we miss:** Upstream's `/linkedin` redirect and its email-footer LinkedIn link.

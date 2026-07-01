# Skipped Upstream Changes — 2026-07-01

Changes from simstudioai/sim we deliberately did not take during this sync.

- **#5195 SSE reader consolidation — `apps/sim/app/chat/hooks/use-chat-streaming.ts` only.** `apps/sim/app/chat/` is fork-owned (`merge-policy.json` `forkFirst`) and the fork heavily rewrote this streaming hook (+164/−18) for the Arena chat surface. #5195 is a refactor (consolidate client SSE readers behind a typed primitive), not a fix, so fork-first applies: keep the fork's hook, do not adopt the upstream rewrite for this file. The shared SSE primitive itself lands via the merge in upstream-owned paths; only the chat hook's adoption of it is skipped.

- **#5219 SettingsPanel — landing page `apps/sim/app/(landing)/landing.tsx` HEAD version skipped.** The fork had an older full-page landing shell with `Templates`, `Collaboration`, `Pricing`, `Testimonials` sections. Took upstream's new `LandingShell`-based structure (`Mothership`, `Cta`) per the `(landing)/CLAUDE.md` directive (no `--landing-*` tokens, platform light-mode tokens only). Fork-specific sections (templates, collaboration) were deleted by upstream and are no longer rendered.

- **`apps/sim/app/(landing)/page.tsx` — "Arena" branding kept over upstream's "Sim".** All metadata titles, descriptions, and OG/Twitter alt text keep "Arena" instead of "Sim" (fork identity preservation). This is intentional fork divergence from the OSS upstream.

- **`apps/sim/app/(interfaces)/chat/components/message-container/message-container.tsx` — `ArenaClientChatMessage` kept over `ClientChatMessage`.** The message container renders the fork's Arena-styled chat message component. Upstream's `ClientChatMessage` was not adopted for this component since `ArenaClientChatMessage` is a fork addition with Arena-specific layout.

- **`combobox.tsx` DEFAULT_MODEL — kept `gpt-5` over `claude-sonnet-5`.** Fork preference is OpenAI models as default. Upstream switched to Claude Sonnet 5 as the default model for new blocks; fork retains `gpt-5`.

- **`apps/sim/app/api/workspaces/[id]/inbox/route.ts` — `hasInboxAccess` fork guard removed.** The fork's HEAD block referenced `hasInboxAccess(session.user.id)` (an "Arena Mailer requires a Max plan" gate) but the function does not exist in the codebase. Took upstream's simpler permission-only check to avoid a compile error.

- **`apps/sim/blocks/blocks/agent.ts` — default model kept as `gpt-4o`/`gpt-5` over `claude-sonnet-5`.** Upstream switched the agent block's default combobox value to `claude-sonnet-5` and tool-config fallback to `claude-sonnet-5`. Fork retains `gpt-4o` (UI default) and `gpt-5` (tool fallback) per fork preference for OpenAI models as default (consistent with the skipped combobox.tsx `claude-sonnet-5` change). Used `getAgentModelOptions` (fork function) over upstream's renamed `getModelOptions`.

- **`apps/sim/blocks/registry.ts` — restructured to use `registry-maps.ts`.** Took upstream's new two-file split (block configs + metas moved to `registry-maps.ts`; `registry.ts` keeps only accessor functions). Added fork-specific blocks to `registry-maps.ts`: `arena`, `facebook_ads`, `figma`, `image_fusion`, `google_ads_v1`, `p2_docs`, `presentation`, `semrush`, `spyfu`, `unipile`.

- **`apps/sim/components/emails/components/email-layout.tsx` — fork's hardcoded Arena PNG logo URL not taken.** The fork overrode the email header logo with a hardcoded S3 PNG (`arenaLogoTextBlack.png`) because `brand.logoUrl` defaults to an SVG which some email clients don't render. Took upstream's `hasCustomLogo = Boolean(brand.logoUrl)` approach instead; the `style` line outside the conflict already referenced `hasCustomLogo` so the fork's const couldn't compile cleanly. Operational note: if the SVG renders poorly in email, set `NEXT_PUBLIC_BRAND_LOGO_URL` to a PNG URL in the deployment environment.
  - **Reason skipped:** Upstream's `hasCustomLogo` pattern was already wired into the non-conflicting `style` prop on the same `<Img>` — keeping the fork's `logoPng` const would have left `hasCustomLogo` undefined.
  - **What we miss:** The explicit Arena black-text PNG fallback for email clients that reject SVG; mitigated via env var override.

- **`apps/sim/executor/constants.ts` — `AGENT.DEFAULT_MODEL` kept as `gpt-5` over `claude-sonnet-5`.** Upstream switched `AGENT.DEFAULT_MODEL` to `claude-sonnet-5`; fork retains `gpt-5` per the established fork preference for OpenAI models as executor default (consistent with skipped `combobox.tsx` and `agent.ts` changes).
  - **Reason skipped:** Fork-first policy; OpenAI-default preference is documented and consistent across blocks, combobox, and executor constants.
  - **What we miss:** Executor defaults aligned with upstream's Claude-first model preference.

- **`apps/sim/lib/a2a/agent-card.ts` — kept fork version over upstream deletion.** Upstream deleted this file as part of an A2A module restructure. The fork modified it with Arena-specific branding (`"A2A Agent powered by Arena"`). Kept fork version to preserve Arena integration behavior.
  - **Reason skipped:** Fork-first; file contains Arena-specific branding and the fork actively uses A2A with Arena.
  - **What we miss:** Whatever restructure upstream did to the A2A module.

- **`apps/sim/lib/oauth/utils.ts` — `channels:write` replaced by upstream's `channels:manage`.** Upstream renamed the Slack scope key from `channels:write` to `channels:manage` and updated the `groups:write` description. Took upstream's version as this reflects the actual Slack API scope name (`channels:manage` is the current scope; `channels:write` is deprecated).
  - **Reason skipped:** Not skipped — took upstream's Slack scope rename. Logged here for awareness that `channels:write` no longer appears in SCOPE_DESCRIPTIONS.
  - **What we miss:** N/A — upstream's version is more accurate.

- **`apps/sim/lib/uploads/utils/file-utils.server.ts` — `downloadFileForDelivery` replaced by upstream's `downloadServableFileFromStorage`.** Fork had a simpler `downloadFileForDelivery` using `compileDocumentIfNeeded`. Upstream replaced with `downloadServableFileFromStorage` (better API: `ServableFile` return type, `maxBytes` support, pre-filter for doc types, uses `resolveServableDocBytes`). Took upstream's superior implementation.
  - **Reason skipped:** Not skipped — took upstream's improved function. Logged for callers that referenced `downloadFileForDelivery` which no longer exists.
  - **What we miss:** N/A — upstream's version is strictly better.

- **`packages/db/schema.ts` — upstream removal of fork-specific tables rejected (fork-first).** Upstream had an empty block where the fork placed `deployedChat`, `chatPromptFeedback`, `userArenaDetails`, `bannerMessages`, `workflowStatsDaily`, `workflowStatsMonthly`, `a2aTaskStatusEnum`, `a2aAgent`, `a2aTask`, and `a2aPushNotificationConfig` tables. All of these are fork-owned tables supporting Arena-specific functionality and the A2A integration. Per fork-first policy and consistent with the existing skipped-ledger entry keeping `apps/sim/lib/a2a/agent-card.ts`, all fork tables were retained.
  - **Reason skipped:** Fork-first; these tables are not in upstream's schema and back Arena-specific data models (`userArenaDetails`, `deployedChat`, etc.) and the A2A agent protocol the fork actively uses.
  - **What we miss:** Any upstream schema changes in this region (upstream had nothing here — it appears these tables were never in upstream's schema).

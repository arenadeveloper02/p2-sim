# Skipped Upstream Changes — 2026-08-04

Changes from simstudioai/sim we deliberately did not take during this sync.

### 2026-08-04 — simstudioai/sim#5735 — fix(mothership): bug fixes

- **Reason skipped:** The fork retains the `use-chat.ts` reconnect contract built around `cachedLiveAssistant`, including the `content`/`contentBlocks` carry-through and `source: 'cache'` result. The upstream test changes for the newer live-state-only contract do not apply to the fork implementation.
- **What we miss:** Upstream regression coverage for the live in-memory reconnect selection and its Redis replay behavior.

### 2026-08-04 — simstudioai/sim#5998 — feat(desktop): desktop app

- **Reason skipped:** The fork's `use-chat.ts` has no `panelForExecutingClientTool` export or desktop/browser panel integration, so the upstream panel-selection tests would not compile and would assert behavior not shipped by the fork.
- **What we miss:** Coverage that restores the browser or terminal panel selected by an executing client tool during reconnect.

### 2026-08-04 — simstudioai/sim#6196 — feat(browser, terminal): implement browser driver, password manager, terminal features

- **Reason skipped:** The fork's `use-chat.ts` has no `waitForDetachedChatResolution` export or the associated browser/terminal detached-chat flow, so the upstream resolution and cancellation tests cannot be applied without importing an unmerged feature.
- **What we miss:** Coverage for durable detached-chat resolution, terminal completion, and cancellation handling.

# Skipped Upstream Changes — 2026-08-04

Changes from simstudioai/sim we deliberately did not take during this sync.

### 2026-08-04 — simstudioai/sim#5410 — feat(mothership): mixture of models, search agent, persistent subagents, fork chat, inline questions (mothership v0.8)

- **Reason skipped:** The fork deliberately deleted `turn-model-serialize.test.ts` in `d4a304b07` as part of removing this test family. Keep the fork's deletion rather than resurrecting an upstream test-only hunk.
- **What we miss:** Coverage for streamed resource-title resolution and completed subagent context compaction serialization.

### 2026-08-04 — simstudioai/sim#5735 — fix(mothership): bug fixes

- **Reason skipped:** The fork deliberately deleted `use-chat.test.ts` in `d4a304b07` as part of removing this test family. Keep the fork's deletion rather than resurrecting the upstream test-only hunk.
- **What we miss:** Coverage for the revised reconnect replay-state behavior.

### 2026-08-04 — simstudioai/sim#5998 — feat(desktop): desktop app

- **Reason skipped:** The fork deliberately deleted both assigned test files in `d4a304b07` as part of removing this test family. Keep the fork's deletions rather than resurrecting upstream test-only hunks.
- **What we miss:** Coverage for updated streamed resource titles and reconnect/client-panel behavior.

### 2026-08-04 — simstudioai/sim#6196 — feat(browser, terminal): implement browser driver, password manager, terminal features

- **Reason skipped:** The fork deliberately deleted `use-chat.test.ts` in `d4a304b07` as part of removing this test family. Keep the fork's deletion rather than resurrecting the upstream test-only hunk.
- **What we miss:** Coverage for detached-chat resolution cancellation and terminal/browser panel selection.

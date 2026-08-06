# Skipped Upstream Changes — 2026-08-06-2

Changes from simstudioai/sim we deliberately did not take during this sync.

### 2026-08-06 — simstudioai/sim#5574 — feat(providers): add xAI to hosted key rotation pool (#5574)

- **Reason skipped:** The upstream `isHosted` guard narrows the provider list and drops the fork's existing SambaNova and OpenRouter hosted-key support. The fork already contains the upstream xAI server-side behavior, so accepting this hunk would be a regression rather than an additive change.
- **What we miss:** No upstream functionality; the fork retains xAI, SambaNova, and OpenRouter support while taking the separate BYOK additions.

### 2026-08-06 — simstudioai/sim#5612 — shimmer subagent/tool labels instead of spinners

- **Reason skipped:** The fork's assistant display-label resolver, multiline live workspace-file title handling, and `PillsRing` icon behavior are fork-owned UI semantics. The upstream hunk's raw `agentLabel`, renamed `title`, barrel icon import, and replacement of the fork spinner were not applied; upstream's `ShimmerText` behavior was merged around those fork-specific details.
- **What we miss:** No intended upstream feature; subagent and tool labels still shimmer while preserving Arena assistant naming, live titles, multiline layout, and the fork's spinner affordance.

### 2026-08-06 — simstudioai/sim#5614 — emcn multi-select selectors

- **Reason skipped:** The upstream `showClearButton` expression drops the fork's `clearable` guard, which would show a clear button for every single-select selector with a value. The multi-select state and change handler were taken, but the fork's independent clearable behavior was retained.
- **What we miss:** The upstream unconditional clear-button behavior is intentionally not adopted because it regresses selectors that are not clearable.

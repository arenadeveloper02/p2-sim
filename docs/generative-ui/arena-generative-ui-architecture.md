# Arena Generative UI architecture

How generate, compile, and runtime are split for the **Arena Generative UI** block. Authoring and publish flow: [arena-generative-ui.md](./arena-generative-ui.md). How to fill the block: [arena-generative-ui-user-guide.md](./arena-generative-ui-user-guide.md).

Generate-time is Intent → Plan → Recipes → JSON → Critic. That is not one LLM per box. Intent Analyzer and UI Planner are cheap calls. Constitution, design system, design intent, design guidelines, archetype recipe, and capability recipes are **prompt modules** on the spec call. The spec LLM is the only full generate. The UI critic inspects JSON after generate (host lint + one-shot Haiku). Patch/repair reuses the spec repair turns.

The LLM owns sitemap, copy, and wiring. The host owns loading, error, retry, and confirm.

Off this diagram on purpose: `BindingLayoutPlan` is deterministic (from binding schemas). `compileGenerativeUx` runs at preview / page load, not as the UI Planner.

```
USER BRIEF
        │
        ▼
┌───────────────────────────────────────┐
│ INTENT ANALYZER                       │  LLM (cheap, Haiku)
│    intent-analyzer.ts                 │  task, entities, data,
│    fail-open → planner still runs     │  actions, complexity
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ UI PLANNER                            │  LLM (cheap, Sonnet)
│    structured-brief.ts                │  archetype, sitemap,
│    fail-open → spec still runs        │  capabilities[], designIntent
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ CONSTITUTION                          │  Prompt (not an LLM)
│    constitution.ts                    │  Generator-owned clauses
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ DESIGN SYSTEM                         │  Prompt (not an LLM)
│    catalog.ts ARENA DESIGN SYSTEM     │  Host tokens, theme, two surfaces; gap/padding tokens + Card.variant
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ DESIGN INTENT                         │  Prompt (not an LLM)
│    design-intent.ts                   │  productType, density, tone,
│                                       │  contentType, emphasis
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ DESIGN GUIDELINES                     │  Prompt (not an LLM)
│    design-guidelines.ts               │  Layout, hierarchy, density
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ ARCHETYPE RECIPE                      │  Prompt (not an LLM)
│    structured-brief.ts                │  One sitemap shape
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ CAPABILITY RECIPES                    │  Prompt (not an LLM)
│    capabilities.ts                    │  Wait + product tags
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ JSON RENDER                           │  LLM (full spec)
│    generate-manifest.ts               │  Catalog-constrained
│    prompt-pipeline.ts                 │  validate + host critic
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ UI CRITIC                             │  Host lint + Haiku inspect
│    ui-critic.ts                       │  After JSON, fail-open
│    critique-manifest.ts               │  must-fix may repair once
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ PATCH / REPAIR → FINAL UI             │  Spec repair turns
└───────────────────────────────────────┘
```

`prompt-pipeline.ts` orders the spec prompt as persona → constitution → **design system** (host-owned tokens; gap/padding tokens and Card.variant are the only visual knobs on elements) → **design intent** (productType, density, visualTone, contentType, emphasis) → **design guidelines** (visual composition) → UX (data state, action contract, host interaction, a11y) → anti-patterns → **component grammar** → archetype recipe → **capability recipes** → gold → mechanical component rules → JSON envelope. Still one generate call. There is no `UI CRITIC` heading in that prompt. Design System is tokens; Design Intent is which product/density/tone to apply; Design Guidelines is how to compose them; UX is loading/empty/error/success/forms-behavior/navigation-behavior/accessibility. Layout, visual hierarchy, and responsive collapse live inside Design Guidelines, not as sibling headings.

## Layers

### 1. Intent Analyzer and UI Planner

Followed. `analyzeArenaGenerativeIntent` extracts task, audience, entities, data requirements, actions, and workflow complexity. It does not pick an archetype, pages, or catalog types. Unknown `apiKey`s are dropped against declared bindings. Fail-open: `intent: null` and the planner still runs from prose.

`planArenaGenerativeStructuredBrief` consumes that intent (when present) and emits title, purpose, audience, archetype, sitemap, actions, `capabilities[]`, and optional `designIntent`. Legacy stored `processing` wait tags fold into `capabilities` so old drafts still edit. Intent is nested on the same jsonb (`structured_brief.intent`) — no DB migration. Unknown designIntent axes are dropped (fail-open); `spacious` density aliases to `roomy`.

Wait tags (`long-running`, `streaming`, `multi-step`, `cancellable`) apply to any archetype. Product tags (`search`, `filter`, `pagination`, `selection`, `editable`) are short when/how recipes, catalog types only. Host inference: workflow binding → `long-running`; `stream: true` → `streaming`; `binding.pagination` → `pagination`. `short` is not a capability (omit wait modules).

Edit does **not** re-plan the product by default. Theme-only Requested Changes still skip the LLM. Page and global edits skip analyzer and planner and reuse the generate-time structured brief stored on the draft. An explicit re-plan phrase (`re-plan`, `rebuild the app`, `start over`, `turn this into a dashboard`) runs analyzer and planner again, generates a new sitemap, and overwrites the stored structured brief.

### 2. UX / interaction

Followed in spirit, implemented as compile, not a second planner. `compileGenerativeUx` relocates loaders, injects same-page Open chrome, fills pending status, and builds `uxPlan` (kind, confirm, retry).

The Universal UI/UX Constitution (`constitution.ts`) is the quality contract for every generated app. Generator-owned clauses (hierarchy, density, Back, empty copy, `statePath`) go to the spec prompt. Host-owned clauses (disable while pending, destructive confirm, banners, toasts, skeletons) stay with the compiler — the prompt says bind / do not emit a second copy.

| Ownership | Constitution | Who enforces it |
|---|---|---|
| Generator emits | Composition, one primary action, grouping, density, consistency, content, Back, labels, `statePath` / `emptyText`, WorkingCard when the brief names a long wait | Spec LLM + catalog rules |
| Host compiles | Pending disable, double-submit guard, destructive confirm, field errors, API banner, save toast, skeletons, Grid/Columns collapse | `ux-compiler` + `ux-defaults` + renderer |

Policy lives in `ux-policy.ts` (`HOST UX: the runtime compiles loading, error, retry…`). Principles and nevers are derived from the constitution. When the brief names a generate wait, the spec emits `WorkingCard` and the host ticks it.

`BindingLayoutPlan` sits beside this: it is the **data** contract (hostKeys, Table vs DataText), not interaction chrome.

### 3. UI spec

Followed. The spec Claude call emits the stored manifest. Validate against the catalog **and** the layout plan (form names, hostKeys, no Results `onLoad` of a navigate-first CTA). The **host critic** (`ui-critic.ts`) then walks the JSON for proveable quality gaps validation does not cover (duplicate onLoad apiKeys, unbound Stat/Sparkline, Card-in-Card, more than one primary per Section, too many non-Repeat Cards, missing Back on an `onSuccess.navigate` target). Those failures reuse the same two repair turns. After a spec that passes both, a one-shot Haiku critic (`critique-manifest.ts`) asks UX / visual / responsive / accessibility / data questions the host cannot prove. Only `must-fix` may trigger one extra spec repair; the critic is never called again, and a critic outage fails open. This is not a generate-time prompt layer. Compiled widgets are **not** written back to the draft.

`DESIGN INTENT` (`design-intent.ts`) is the classification card: productType, density, visualTone, contentType, and emphasis. The planner may emit it on the structured brief; the spec prompt still includes the mapping table. These are not component props. Density maps to `manifest.theme.density` (`spacious` → `roomy`).

`DESIGN GUIDELINES` (`design-guidelines.ts`) is the global visual-composition contract: visual language, layout (Page → Section → PageHeader, measure vs wide collections, two columns, Toolbar, one dominant region), visual hierarchy (L1–L5, one primary per Section, muted metadata), typography, color roles, spacing tokens (`gap "lg"`), cards (`variant` default / muted), buttons, forms (visual), tables, visualization, icons, responsive (Grid/Columns collapse), content, density, consistency, and professionalism. Host caps Form width with `--gui-measure`. The spec must not dump Table/Form on Page, wrap every Section in a Card, or run a form the full 1280px.

`COMPONENT SELECTION RULES` (`component-decisions.ts`) sit immediately before the archetype recipe. They teach when to pick a catalog type (Table vs Repeat, Tabs vs wizard pages, Drawer vs a new onLoad). Filter, Drawer, Modal, and Toast are catalog types for **in-content** jobs the brief asked for. Host still owns save success (`ActionSuccessToast`) and destructive confirm (`DestructiveConfirmDialog`); the spec must not emit Modal or Toast for those.

`ANTI-PATTERNS` (`anti-patterns.ts`) sits immediately before component grammar. It is the explicit Never list (hard-coded data, fake Stat, decorative Sparkline, Table for narrative, Form without input, dead Button, unused Filter/SearchField). Host rejects a Button with no verb. Design Guidelines stay the positive how.

`DATA STATE CONTRACT` (`data-state-contract.ts`) sits immediately before `ACTION CONTRACT`. It teaches loading / empty / error / partial / success / stale. The host skeletons bound regions, sanitizes API errors, shows Retry when the action is not destructive, keeps existing data while refetching (`aria-busy`), and offers **Refresh** on pages that have already attempted `onLoad`. EmptyState’s child is the next useful action. The spec must not emit a page-level Skeleton, a second error Alert, or a Refresh Button.

`ACTION CONTRACT` (`action-contract.ts`) sits immediately before `INTERACTION / STATE RULES`. It teaches before / during / success / error for user-triggered CTAs (SubmitButton, Button, SearchField, Chip with `actionId`). The host disables the control and shows a spinner on it, keeps the form visible, toasts a same-page save, confirms destructive actions, and shows a sanitized banner with Retry when meaningful. Page `onLoad` stays on the data-state contract. The spec must not emit disable overlays, a success Toast, or per-action YAML.

### 4. Runtime

Followed. Preview and published both compile in memory, then `SpecRenderer` paints. `run-action` + `actionStateFromPlan` merge payloads onto plan keys; `inputSchema` drops extra fields; live `outputSchema` drift is warn-only. Pending is per `actionId`. Confirm, retry, and control disable consult `uxPlan`. Bound regions stay visible while refetching (`aria-busy`); host **Refresh** re-runs `onLoad` without `resetState`; API errors are sanitized before the banner.

## Where it is not a clean four-box

| Leak | What that means |
|---|---|
| Spec LLM still sees UX copy | Catalog + `HOST_UX_PROMPT` + gold examples still teach `showWhen`, `selectItem`, empty copy. Compiler covers misses; the model can still emit chrome. |
| Confirm / retry / errors are host overlays | Plan-driven now (`uxPlan.actions` on preview compile and published config). Still one dialog and one banner, not per-component machines. |
| Extra layer: data contract | `BindingLayoutPlan` was not in the original four. Generate, validate, merge, and render now share it. |
| Theme-only edits skip the LLM | Intentional. Page and global edits reuse the generate-time structured brief without analyzer or planner. An explicit re-plan phrase runs both again and overwrites that brief. Drafts from before this column still edit from prose only. |
| UI critic is a fifth cheap call | After spec validate + host lint. Haiku inspects compact JSON; `must-fix` can spend one leftover repair turn. Fail-open on critic errors. Not a `prompt-pipeline.ts` heading. |

## Summary

**Intent → Plan → Recipes → JSON → Critic** is generate-time. Compile and runtime stay off that diagram: `compileGenerativeUx` is preview, not the UI Planner. The LLM must not own production loading/error/retry behavior.

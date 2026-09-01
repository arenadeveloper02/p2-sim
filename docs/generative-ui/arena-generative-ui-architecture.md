# Arena Generative UI architecture

How generate, compile, and runtime are split for the **Arena Generative UI** block. Authoring and publish flow: [arena-generative-ui.md](./arena-generative-ui.md). How to fill the block: [arena-generative-ui-user-guide.md](./arena-generative-ui-user-guide.md).

Generate-time is Intent → Plan → three prompt columns → semantic JSON → validate → critic. That is not one LLM per box. Intent Analyzer and UI Planner are cheap calls. Constitution, design system, design intent, design guidelines, archetype recipe, and capability recipes are **prompt modules** on the spec call. The spec LLM (**JSON GENERATOR**) is the only full generate. It emits semantic catalog JSON only (types, `statePath`, variants, spacing tokens). The host Design System paints `--gui-*` at **JSON RENDER**. The UI critic inspects JSON after generate (host lint + one-shot Haiku). Patch/repair reuses the spec repair turns.

The LLM owns sitemap, copy, and wiring. The host owns loading, error, retry, confirm, color, type, and radius.

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
│    fail-open → spec still runs        │  capabilities[],
│                                       │  informationHierarchy,
│    Design System context ─────────────│  interactionModel,
│    (planner blurb, not full spec DS)  │  designIntent
└──────────────────┬────────────────────┘
          ┌────────┼────────┐
          ▼        ▼        ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ DESIGN RULES │ │ UX RULES /   │ │ ARCHETYPE    │  Prompt (not an LLM)
│ / TOKENS     │ │ STATES       │ │ RECIPE       │  Spec prompt columns
│ catalog.ts   │ │ constitution │ │ structured-  │  Serial: Design → UX
│ design-intent│ │ data-state   │ │ brief.ts     │  → Archetype so tokens
│ design-      │ │ action       │ │ capabilities │  constrain recipes
│ guidelines   │ │ host / a11y  │ │ gold +       │
│              │ │ anti-patterns│ │ catalog JSON │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       └────────┬───────┴────────┬───────┘
                ▼
┌───────────────────────────────────────┐
│ JSON GENERATOR                        │  LLM (full spec)
│    generate-manifest.ts               │  Semantic catalog JSON
│    prompt-pipeline.ts                 │  types, statePath, tokens
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ JSON VALIDATOR                        │  Catalog + layout plan
│    validate-manifest.ts               │  Host critic in the same
│    ui-critic.ts (lint in generate)    │  generate loop
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ UI CRITIC / REPAIR                    │  Host lint + Haiku inspect
│    ui-critic.ts                       │  After JSON, fail-open
│    critique-manifest.ts               │  must-fix may repair once
│    spec repair turns                  │
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ JSON RENDER (host Design System)      │  Runtime, not an LLM
│    spec-renderer.tsx                  │  Paints --gui-* tokens
│    generative-app-theme.css           │  Preview + published
└───────────────────────────────────────┘
```

| Diagram box | Code |
|---|---|
| INTENT ANALYZER | `intent-analyzer.ts` |
| UI PLANNER | `structured-brief.ts` (archetype, capabilities, informationHierarchy, interactionModel, designIntent) |
| JSON GENERATOR | `generate-manifest.ts` spec LLM |
| JSON VALIDATOR | `validate-manifest.ts` + host critic in the same generate loop |
| UI CRITIC/REPAIR | `ui-critic.ts` + `critique-manifest.ts` + spec repair turns |
| JSON RENDER | `spec-renderer.tsx` + `generative-app-theme.css` (runtime). `compileGenerativeUx` stays a footnote — preview, not the planner |

`prompt-pipeline.ts` orders the spec prompt as persona → **DESIGN RULES / TOKENS** (Arena Design System, Design Intent mapping table, Design Guidelines) → **UX RULES / STATES** (constitution, data-state, action contract, host interaction, a11y, anti-patterns) → **ARCHETYPE RECIPE** (component selection, `ARCHETYPE RECIPE: …`, capability recipes, gold, mechanical component rules, catalog/JSON envelope). Still one generate call. There is no `UI CRITIC` heading in that prompt. The spec LLM is the JSON generator, not JSON render. Design System is tokens; Design Intent is which product/density/tone to apply; Design Guidelines is how to compose them; UX is loading/empty/error/success/forms-behavior/navigation-behavior/accessibility. Layout, visual hierarchy, and responsive collapse live inside Design Guidelines, not as sibling headings.

## Layers

### 1. Intent Analyzer and UI Planner

Followed. `analyzeArenaGenerativeIntent` extracts task, audience, entities, data requirements, actions, and workflow complexity. It does not pick an archetype, pages, or catalog types. Unknown `apiKey`s are dropped against declared bindings. Fail-open: `intent: null` and the planner still runs from prose.

`planArenaGenerativeStructuredBrief` consumes that intent (when present) and emits title, purpose, audience, an app-level archetype, optional `shell`, per-page shapes, optional `entity`, optional `representation`, optional `pages[].modules`, sitemap, actions, `capabilities[]` (at most five planned), optional `designIntent`, optional `informationHierarchy`, and optional `interactionModel`. The planner sees a compact Design System blurb (two surfaces, host-owned color/type/radius, density `compact|comfortable|roomy`, spacing tokens on gap/padding) so `designIntent` is classified with token context — it still must not emit component types or a manifest. Legacy stored `processing` wait tags fold into `capabilities` so old drafts still edit. Intent is nested on the same jsonb (`structured_brief.intent`) — no DB migration. Unknown designIntent / hierarchy / interaction / shell axes are dropped (fail-open); `spacious` density aliases to `roomy`. Unknown `representation` fails open to `auto`.

**Application architecture is shell + sitemap. Design System is host-owned.** Each page is one primary archetype + 0–5 capabilities + modules. Representation (`auto | table | cards | list | kanban | timeline`) picks the collection body. `kanban` / `timeline` have no catalog types — they degrade to grouped or dated Repeat/Table. The spec must not invent `Kanban`, `Timeline`, or `List` components. Do not emit `detail + results + dashboard` as peer jobs on one page.

Wait tags (`long-running`, `streaming`, `multi-step`, `cancellable`, `progress`) apply to any page shape. Product tags (`search`, `filter`, `sort`, `pagination`, `grouping`, `date-range`, `refresh`, `drill-down`, `selection`, `detail`, `detail-drawer`, `analyze`, `drawer`, `modal`, `create`, `edit`, `delete`, `back`, `skip`, `review`) are short when/how recipes. `detail` opens one entity (navigate, drawer, modal, or inline); `detail-drawer` is the keep-list-visible specialization; `analyze` is a generate/analyze CTA whose destination is a results page or a named analysis module. Stored `editable` aliases to `edit`. Host inference (does not count toward the planned five): workflow binding → `long-running`; `stream: true` → `streaming`; `binding.pagination` → `pagination`. `short` is not a capability (omit wait modules). `wait: working-card` on interactionModel only when a wait capability is set. Do not plan `generate` / `export` / `share` / `comments` / `table` / `chart` / `kanban` as capabilities.

`search` / `filter` without a declared binding action are host-local: `SearchField` without `actionId` and `Filter` / `Toolbar` Selects named after collection columns narrow the on-page Table or Repeat. A SearchField whose `actionId` is a known host action still submits that API and does not also filter locally.

### App shell and page shapes

```
APPLICATION
├── APP ARCHITECTURE
│   ├── Shell — navigation, header, breadcrumbs, global chrome
│   └── Sitemap — pages, each one job
└── DESIGN SYSTEM — host tokens; not a planner job
```

`shell?: { navigation: none | tabs | sidebar, header?, breadcrumbs? }`. Default is omit / `none` (typical one-job Arena app — no fake SaaS chrome). `sidebar` emits catalog `Workspace` (navigator / primary / inspector, `selectedId` sync; host collapses inspector, then navigator). `tabs` emits `Tabs`. `interactionModel.navigation: workspace` does not set shell (classification-only).

The app has one primary `archetype` (the entry job). **Each sitemap page also declares `pages[].archetype`**. Mixed apps are normal: home = `task` and destination = `results`; home = `collection` and record = `detail`. Extra jobs are extra pages. Formula: one primary + 0–5 planned capabilities + `modules[]` + `representation` + `BindingLayoutPlan` + `designIntent`.

`pages[].modules` are domain sections (`firmographics`, `marketing`, `competitors`, `ai-analysis`, `activity`) — not peer archetypes. Supporting content that is another job belongs on another sitemap page.

| Shape | Core question | Slots |
|---|---|---|
| `collection` | How do I browse/manage many things? | Header → Toolbar → collection body (representation decides Table / Cards / List / grouped Repeat) → optional modules |
| `detail` | How do I understand one thing? | Header, facts, data-model modules, related, actions |
| `task` | How do I provide information to accomplish something? | Header, context, Form or SearchField, one primary action. Results are optional (another page) |
| `results` | How do I consume/analyze generated output? | Context, summary, primary result, supporting, actions. Wait chrome is a capability |
| `dashboard` | How do I monitor many important signals? | Header, filters, KPI/summary, primary module, supporting, activity. Module count follows `layoutPlan` |
| `workflow` | How do I complete a multi-stage task? | Progress (`Stepper`), current step, navigation. Not automatically one page per step |
| `content` | How do I read/create/edit substantial content? | Header, metadata, `DataText` body, optional related, actions |

Planner disambiguation: scan modules on arrival → **Dashboard**; find/act on a list → **Collection**; one entity → **Detail**; one-shot form → **Task**; sequential stages → **Workflow**; generate/analyze output → **Results**; document-as-product → **Content**. Persistent navigation / header / breadcrumbs is a **shell** question, not an eighth page job.

Stored jsonb aliases (no DB migration; unknown **archetype** still fails Zod and `parseStoredStructuredBrief` returns `null`): `list-detail` → app `collection` with pages `collection` + `detail`; `form-result` → app `task` (destination path `results` → `results`); `wizard` → `workflow`; `workspace` → page job from `regions.primary` or `collection`, plus `shell.navigation: sidebar`. Stored `pages[].regions` / `pages[].secondary` fold into `modules` (`navigator` / `inspector`, or the secondary role) and are stripped.

`generate-manifest.ts` injects recipes for every page job plus `SHELL RECIPE` when chrome is not `none` (`archetypeRecipesForBrief`) and `formatPageShapesForGenerator` so a mixed sitemap is not generated as if every page were the entry shape. Gold few-shots: task (default), collection/detail, dashboard (variable KPI row — not four Stats), workflow (`Stepper`; page-per-stage *or* single-page sections), content, sidebar-shell (catalog `Workspace`, keyed by `shell.navigation === sidebar`).

Edit does **not** re-plan the product by default. Theme-only Requested Changes still skip the LLM. Page and global edits skip analyzer and planner and reuse the generate-time structured brief stored on the draft. An explicit re-plan phrase (`re-plan`, `rebuild the app`, `start over`, `turn this into a dashboard`) runs analyzer and planner again, generates a new sitemap, and overwrites the stored structured brief.

### 2. UX / interaction

Followed in spirit, implemented as compile, not a second planner. `compileGenerativeUx` relocates loaders, injects same-page Open chrome, fills pending status, and builds `uxPlan` (kind, confirm, retry). It is preview/runtime, not the UI Planner.

The Universal UI/UX Constitution (`constitution.ts`) is the quality contract for every generated app. Generator-owned clauses (hierarchy, density, Back, empty copy, `statePath`) go to the spec prompt under **UX RULES / STATES**. Host-owned clauses (disable while pending, destructive confirm, banners, toasts, skeletons) stay with the compiler — the prompt says bind / do not emit a second copy.

| Ownership | Constitution | Who enforces it |
|---|---|---|
| Generator emits | Composition, one primary action, grouping, density, consistency, content, Back, labels, `statePath` / `emptyText`, WorkingCard when the brief names a long wait | Spec LLM + catalog rules |
| Host compiles | Pending disable, double-submit guard, destructive confirm, field errors, API banner, save toast, skeletons, Grid/Columns collapse | `ux-compiler` + `ux-defaults` + renderer |

Policy lives in `ux-policy.ts` (`HOST UX: the runtime compiles loading, error, retry…`). Principles and nevers are derived from the constitution. When the brief names a generate wait, the spec emits `WorkingCard` and the host ticks it.

`BindingLayoutPlan` sits beside this: it is the **data** contract (hostKeys, Table vs DataText), not interaction chrome.

### 3. UI spec (JSON GENERATOR)

Followed. The spec Claude call emits the stored manifest as **semantic catalog JSON** (component types, `statePath`, variants, spacing tokens) — not painted chrome. Validate against the catalog **and** the layout plan (form names, hostKeys, no Results `onLoad` of a navigate-first CTA). The **host critic** (`ui-critic.ts`) then walks the JSON for proveable quality gaps validation does not cover (duplicate onLoad apiKeys, unbound Stat/Sparkline, Card-in-Card, more than one primary per Section, too many non-Repeat Cards, missing Back on an `onSuccess.navigate` target). Those failures reuse the same three repair turns. After a spec that passes both, a one-shot Haiku critic (`critique-manifest.ts`) asks UX / visual / responsive / accessibility / data questions the host cannot prove. Only `must-fix` may trigger one extra spec repair; the critic is never called again, and a critic outage fails open. If repairs are spent, the block lists the remaining catalog and host-critic issues and what to change in User Input, Pages, or API Bindings. This is not a generate-time prompt layer. Compiled widgets are **not** written back to the draft.

`DESIGN INTENT` (`design-intent.ts`) is the classification card: productType, density, visualTone, contentType, and emphasis. The planner may emit it on the structured brief; the spec prompt still includes the mapping table. These are not component props. Density maps to `manifest.theme.density` (`spacious` → `roomy`).

`DESIGN GUIDELINES` (`design-guidelines.ts`) is the global visual-composition contract: visual language, layout (Page → Section → PageHeader, measure vs wide collections, two columns, Toolbar, one dominant region), visual hierarchy (L1–L5, one primary per Section, muted metadata), typography, color roles, spacing tokens (`gap "lg"`), cards (`variant` default / muted), buttons, forms (visual), tables, visualization, icons, responsive (Grid/Columns collapse; Workspace stacks inspector then navigator), content, density, consistency, and professionalism. Host caps Form width with `--gui-measure`. The spec must not dump Table/Form on Page, wrap every Section in a Card, or run a form the full 1280px. Three peer chrome columns are forbidden except Workspace (navigator + primary + inspector; navigator and inspector are supporting).

`COMPONENT SELECTION RULES` (`component-decisions.ts`) sit immediately before the archetype recipe, inside the **ARCHETYPE RECIPE** column. They teach when to pick a catalog type (`Stepper` vs Tabs, `Workspace` vs Columns). `REPRESENTATION` (`representation.ts`) follows the compact recipes and decides Table vs Cards vs List vs grouped Repeat — not a second archetype. Filter, Drawer, Modal, and Toast are catalog types for **in-content** jobs the brief asked for. Host still owns save success (`ActionSuccessToast`) and destructive confirm (`DestructiveConfirmDialog`); the spec must not emit Modal or Toast for those.

`ANTI-PATTERNS` (`anti-patterns.ts`) sits in the **UX RULES / STATES** column. It is the explicit Never list (hard-coded data, fake Stat, decorative Sparkline, Table for narrative, Form without input, dead Button, unused Filter/SearchField). Host rejects a Button with no verb. Design Guidelines stay the positive how.

`DATA STATE CONTRACT` (`data-state-contract.ts`) sits immediately before `ACTION CONTRACT`. It teaches loading / empty / error / partial / success / stale. The host skeletons bound regions, sanitizes API errors, shows Retry when the action is not destructive, keeps existing data while refetching (`aria-busy`), and offers **Refresh** on pages that have already attempted `onLoad`. EmptyState’s child is the next useful action. The spec must not emit a page-level Skeleton, a second error Alert, or a Refresh Button.

`ACTION CONTRACT` (`action-contract.ts`) sits immediately before `INTERACTION / STATE RULES`. It teaches before / during / success / error for user-triggered CTAs (SubmitButton, Button, SearchField, Chip with `actionId`). The host disables the control and shows a spinner on it, keeps the form visible, toasts a same-page save, confirms destructive actions, and shows a sanitized banner with Retry when meaningful. Page `onLoad` stays on the data-state contract. The spec must not emit disable overlays, a success Toast, or per-action YAML.

### 4. Runtime (JSON RENDER)

Followed. Preview and published both compile in memory, then `SpecRenderer` paints host Design System CSS (`generative-app-theme.css`, `--gui-*`). `run-action` + `actionStateFromPlan` merge payloads onto plan keys; `inputSchema` drops extra fields; live `outputSchema` drift is warn-only. Pending is per `actionId`. Confirm, retry, and control disable consult `uxPlan`. Bound regions stay visible while refetching (`aria-busy`); host **Refresh** re-runs `onLoad` without `resetState`; API errors are sanitized before the banner.

## Where it is not a clean four-box

| Leak | What that means |
|---|---|
| Spec LLM still sees UX copy | Catalog + `HOST_UX_PROMPT` + gold examples still teach `showWhen`, `selectItem`, empty copy. Compiler covers misses; the model can still emit chrome. |
| Confirm / retry / errors are host overlays | Plan-driven now (`uxPlan.actions` on preview compile and published config). Still one dialog and one banner, not per-component machines. |
| Extra layer: data contract | `BindingLayoutPlan` was not in the original four. Generate, validate, merge, and render now share it. |
| Theme-only edits skip the LLM | Intentional. Page and global edits reuse the generate-time structured brief without analyzer or planner. An explicit re-plan phrase runs both again and overwrites that brief. Drafts from before this column still edit from prose only. |
| UI critic is a fifth cheap call | After spec validate + host lint. Haiku inspects compact JSON; `must-fix` can spend one leftover repair turn. Fail-open on critic errors. Not a `prompt-pipeline.ts` heading. Generate-time, not JSON RENDER. |

## Summary

**Intent → Plan → three columns → semantic JSON → validate → critic → host render** is the generate-then-runtime path. One spec generate. Critic is generate-time. JSON RENDER is preview/published host paint. `compileGenerativeUx` is preview, not the UI Planner. The LLM must not own production loading/error/retry behavior, and must not pick hex, fonts, or radius.

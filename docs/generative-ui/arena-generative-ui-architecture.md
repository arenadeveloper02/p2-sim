# Arena Generative UI architecture

How generate, compile, and runtime are split for the **Arena Generative UI** block. Authoring and publish flow: [arena-generative-ui.md](./arena-generative-ui.md). How to fill the block: [arena-generative-ui-user-guide.md](./arena-generative-ui-user-guide.md).

Intent → spec → compile → runtime. That split is the spine. It is not four LLM stages. Intent is one cheap plan call; UX is a **deterministic compiler**; the spec is the only full generate call; runtime executes and overlays chrome.

The LLM owns sitemap, copy, and wiring. The host owns loading, error, retry, and confirm.

```
User Input + API Bindings
        │
        ▼
┌───────────────────────────────────────┐
│ 1. Intent / product understanding     │  LLM (cheap)
│    structured-brief.ts                │  Generate only
│    title, audience, archetype,        │
│    sitemap, per-page data/actions     │
└──────────────────┬────────────────────┘
                   │ BindingLayoutPlan (deterministic, from schemas)
                   ▼
┌───────────────────────────────────────┐
│ 2. UX / interaction (compiler)        │  No LLM
│    ux-policy · ux-defaults            │  At preview / page load
│    compileGenerativeUx                │  Not persisted
│    loaders, same-page Open, pending   │
└──────────────────┬────────────────────┘
                   │ (prompt sees plan + HOST UX rules)
                   ▼
┌───────────────────────────────────────┐
│ 3. UI spec                            │  LLM (full)
│    generate-manifest.ts               │  Catalog-constrained
│    json-render Spec per page          │  validate + repair
│    stored draft manifest              │
└──────────────────┬────────────────────┘
                   │ persist draft → Preview / Launch
                   ▼
┌───────────────────────────────────────┐
│ 4. Runtime                            │  No LLM
│    SpecRenderer · run-action          │
│    hosts (preview + published)        │
│    state, SSE, banners, confirm       │
└───────────────────────────────────────┘
```

## Layers

### 1. Intent / product understanding

Followed. `planArenaGenerativeStructuredBrief` is a small JSON object (`purpose`, `audience`, archetype, pages, actions). It does not emit components. If it fails, generate still runs from prose.

Edit does **not** re-plan the product by default. Theme-only Requested Changes still skip the LLM. Page and global edits reuse the generate-time structured brief stored on the draft (gold layout + context) without pinning that sitemap. An explicit re-plan phrase (`re-plan`, `rebuild the app`, `start over`, `turn this into a dashboard`) runs the planner again, generates a new sitemap, and overwrites the stored structured brief.

### 2. UX / interaction

Followed in spirit, implemented as compile, not a second planner. `compileGenerativeUx` relocates loaders, injects same-page Open chrome, fills pending status, and builds `uxPlan` (kind, confirm, retry).

Policy lives in `ux-policy.ts` (`HOST UX: the runtime compiles loading, error, retry…`). The generator is told not to emit Alert/Toast/ProgressSteps for that chrome.

`BindingLayoutPlan` sits beside this: it is the **data** contract (hostKeys, Table vs DataText), not interaction chrome.

### 3. UI spec

Followed. The second Claude call emits the stored manifest. Validate against the catalog **and** the layout plan (form names, hostKeys, no Results `onLoad` of a navigate-first CTA). Up to two repair turns. Compiled widgets are **not** written back to the draft.

### 4. Runtime

Followed. Preview and published both compile in memory, then `SpecRenderer` paints. `run-action` + `actionStateFromPlan` merge payloads onto plan keys; `inputSchema` drops extra fields; live `outputSchema` drift is warn-only. Pending is per `actionId`. Confirm, retry, and control disable consult `uxPlan`.

## Where it is not a clean four-box

| Leak | What that means |
|---|---|
| Spec LLM still sees UX copy | Catalog + `HOST_UX_PROMPT` + gold examples still teach `showWhen`, `selectItem`, empty copy. Compiler covers misses; the model can still emit chrome. |
| Confirm / retry / errors are host overlays | Plan-driven now (`uxPlan.actions` on preview compile and published config). Still one dialog and one banner, not per-component machines. |
| Extra layer: data contract | `BindingLayoutPlan` was not in the original four. Generate, validate, merge, and render now share it. |
| Theme-only edits skip the LLM | Intentional. Page and global edits reuse the generate-time structured brief without re-planning. An explicit re-plan phrase runs the planner again and overwrites that brief. Drafts from before this column still edit from prose only. |

## Summary

**Intent → spec → compile → runtime** is what shipped. The UX “planner” is the compiler plus policy, not another model call — which matches the rule that the LLM must not own production behavior.

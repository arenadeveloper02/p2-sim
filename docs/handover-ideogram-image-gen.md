# Handover: Ideogram Image Generation & Related Work

**Author:** Utcarsh  
**Date:** 2026-07-31  
**Primary branch:** `feat/ideogram-image-gen`  
**Status:** Feature largely shipped on branch; open product gaps and one cost-attribution bug remain.

This document covers what was built for Ideogram image generation, how it fits into Sim, what is left, how to test, and adjacent work in this repo that the same owner touched (usage/billing, video, deploy).

---

## 1. Executive summary

Ideogram is integrated as a **separate tool family** (not folded into the shared OpenAI/Gemini/Fal `image_generate` path). Users get:

| Surface | What it does |
|---------|----------------|
| **Image Generator** block | Ideogram as a provider; models are ops: Generate 4.0, Remix 4.0, Inpaint 3.0 (transparent BG is a Generate 4.0 toggle) |
| **Image Post Processor** block | Describe, Layerize Text, Reframe, Remove Background, Upscale |
| **Chat ⋯ menu** on stored images | Same post-process ops (session-auth route + usage `source=image-post-process`) |
| **Agent tools** | Agent can call `ideogram_*` tools when Image Generator / Post Processor is on the agent |

**Still open (priority order):**

1. **Cost log bug** — usage/charge labels use tool id (or look like block name), not the model/op name users pick (unlike OpenAI/Gemini which key by `gpt-image-*` / Gemini model ids).
2. **Layerize Text** — API returns editable `textBlocks` + erased base; UI does **not** let you edit text in-place on the image.
3. **Inpaint in chat** — available on the Image Generator block; **not** in chat with a brush/mask UI.
4. **KJ-nodes-style JSON prompt generator** — non-priority. `jsonPrompt` + `magic_prompt_v4` exist as API/tool fields; no ComfyUI KJNodes-parity builder UI.

---

## 2. Architecture

```
Image Generator (provider=ideogram)
  → resolveIdeogramToolId / buildIdeogramToolParams
  → ideogram_* tool (hosting + pricing via calculateIdeogramHostedCost)
  → POST /api/tools/ideogram
  → persist to agent-generated-images
  → hosted cost → costSummary.charges → usage_log (category: tool)

Image Post Processor block
  → resolvePostProcessorToolId → ideogram_${operation}
  → same proxy

Chat image ⋯ menu
  → useIdeogramPostProcess → POST /api/tools/ideogram/post-process
  → session auth + recordUsage(source: 'image-post-process')
```

OpenAI / Gemini / Fal share `/api/tools/image-generation` + `__imageBilling` and can attribute usage by **model id**. Ideogram is parallel: own proxy, own pricing, own tool ids.

### Why Ideogram is separate

Ideogram’s API is multipart-heavy (images, masks), operation-specific (generate vs layerize vs describe), and priced by **operation + rendering speed**, not a single shared image-gen billing envelope. Tools are created via `createIdeogramProxyTool` in `apps/sim/tools/ideogram/create-tool.ts`.

---

## 3. What shipped

### 3.1 Tools (`apps/sim/tools/ideogram/`)

| Tool ID | Operation | In Image Generator? | In Post Processor / chat ⋯? | Notes |
|---------|-----------|---------------------|-----------------------------|-------|
| `ideogram_generate_v4` | `generate_v4` | Yes (Generate 4.0) | No | Default |
| `ideogram_generate_transparent_v3` | `generate_transparent_v3` | Via Generate 4.0 transparent toggle | No | Higher tier rates |
| `ideogram_remix_v4` | `remix_v4` | Yes | No | Needs input image |
| `ideogram_inpaint_v3` | `inpaint_v3` | Yes (block only) | **No** | Needs image + mask |
| `ideogram_describe_v4` | `describe_v4` | No | Yes | |
| `ideogram_layerize_text` | `layerize_text` | No | Yes | Returns base + `textBlocks` |
| `ideogram_reframe_v3` | `reframe_v3` | No | Yes | Resolution required |
| `ideogram_remove_background` | `remove_background` | No | Yes | |
| `ideogram_upscale` | `upscale` | No | Yes | |
| `ideogram_edit` | `edit` | Legacy only | No | Flat $0.20 |
| `ideogram_generate_v3` / `remix_v3` / `replace_background_v3` | — | No | No | Registered, not in pickers |
| `ideogram_generate_v4_async` + `ideogram_poll_generation` | — | No | No | Async path |
| `ideogram_magic_prompt_v4` | `magic_prompt_v4` | No | No | Cost $0 |
| `ideogram_describe` | describe (older) | No | No | Tool only |

Registry: `apps/sim/tools/registry.ts` (`ideogram_*` keys).

### 3.2 Blocks & field wiring

| File | Role |
|------|------|
| `apps/sim/blocks/blocks/image_generator.ts` | Provider + model routing; Ideogram → `ideogram_*`, else `image_generate` |
| `apps/sim/blocks/blocks/image_post_processor.ts` | Post-process block |
| `apps/sim/lib/image-generation/block-model-config.ts` | Picker models; Ideogram ids: `generate_v4`, `remix_v4`, `inpaint_v3` |
| `apps/sim/lib/image-generation/ideogram-fields.ts` | Generator subBlocks, `resolveIdeogramToolId`, `buildIdeogramToolParams`, transparent routing |
| `apps/sim/lib/image-generation/ideogram-post-processor-fields.ts` | Post-processor ops/UI/param builders |

Legacy Ideogram model ids still routed for saved workflows: `edit`, `generate_transparent_v3` (`IDEOGRAM_LEGACY_IMAGE_MODEL_IDS`).

### 3.3 API routes & contracts

| Path | Role |
|------|------|
| `apps/sim/app/api/tools/ideogram/route.ts` | Internal proxy for workflow/agent tools |
| `apps/sim/app/api/tools/ideogram/server-utils.ts` | Multipart/JSON → Ideogram API; persist images |
| `apps/sim/app/api/tools/ideogram/post-process/route.ts` | Session-auth chat post-process + usage logging |
| `apps/sim/lib/api/contracts/tools/ideogram.ts` | Boundary contracts |
| `apps/sim/hooks/queries/ideogram-post-process.ts` | React Query mutation for chat ⋯ menu |

### 3.4 Chat UI

| Path | Role |
|------|------|
| `.../chat-message/image-post-process-menu.tsx` | ⋯ menu: Describe, Layerize, Reframe, Remove BG, Upscale |
| `.../chat-message/constants.tsx` | Wires menu onto message images |

Post-process results prefer appending onto the source chat message; fall back to a new message so images are not lost.

### 3.5 Pricing & usage

| File | Role |
|------|------|
| `apps/sim/lib/image-generation/ideogram-pricing.ts` | List prices × `USAGE_LOG_COST_MULTIPLIER`; `calculateIdeogramHostedCost` |
| `apps/sim/tools/ideogram/hosting.ts` | Hosted key + `getCost` |
| `packages/db/migrations/0262_image_post_process_usage_source.sql` | Adds `usage_log_source` enum value `image-post-process` |

**Pricing dimensions:** operation + `renderingSpeed` (FLASH / TURBO / DEFAULT / QUALITY) + image count. Flat ops: edit, upscale, describe*, layerize_text, remove_background. Transparent generate uses a higher per-tier table. BYOK → $0.

**Usage paths:**

| Surface | How cost is recorded |
|---------|----------------------|
| Workflow / agent | Tool hosting cost → `costSummary.charges` → `usage_log` `category: 'tool'` |
| Chat ⋯ | `post-process/route.ts` → `recordUsage` with `source: 'image-post-process'` |

### 3.6 Config / BYOK

| Variable | Purpose |
|----------|---------|
| `IDEOGRAM_API_KEY` | Hosted platform key (optional if BYOK) |
| `IDEOGRAM_API_KEY_COUNT` + `_1..N` | Multi-key rotation (hosted-key pattern) |
| `USAGE_LOG_COST_MULTIPLIER` | Scales billed cost |

BYOK provider id: `ideogram` (workspace settings → BYOK). Docker compose (`docker-compose.p2prod.yml`, test env) passes through `IDEOGRAM_API_KEY`.

### 3.7 Notable commit history (branch)

```
b5cc97643e feat(image-gen): embed Ideogram APIs in Image Generator
78e66043e2 feat(image-gen): persist Ideogram outputs and add post-processor
22c48b4420 fix(image-gen): harden Ideogram post-process flow
72e56e5f59 feat(image-gen): treat Ideogram ops as models
817ad8d008 feat(ideogram): accept image file or URL
73471aa629 fix(image-gen): align More/chat publish and agent tool UX
260f9b12a8 refactor(ideogram): fold transparent into Generate 4.0
59bf65d8e4 fix(ideogram): bill model costs into usage logs
```

Earlier exploratory work lived on `feat/ideogram` (including a KJNodes-oriented prompt builder). Current UX is the Image Generator / Post Processor / chat ⋯ path above—not a standalone Comfy-style prompt builder.

---

## 4. Output format

### Ideogram image-producing tools (shared)

Normalized in `create-tool.ts` / `types.ts`:

- `content`, `image`, `imageUrl` — primary persisted URL / file
- `images[]` — `url`, `prompt`, `resolution`, `isImageSafe`, `seed`, …
- `imageUrls[]`
- `created`, optional `responseType`, `s3UploadFailed`

**Layerize** differs: `baseImageUrl`, `originalImageUrl`, `textBlocks`, `seed`.  
**Describe** differs: `jsonPrompt` (and related).

Proxy persists Ideogram CDN URLs into workspace storage (`agent-generated-images`) before returning.

### Shared `image_generate` (OpenAI / Gemini / Fal) — different shape

Includes `provider`, `model`, `metadata`, optional `__imageBilling`. Ideogram does **not** use `__imageBilling`.

**Consistency goal (open):** keep Ideogram outputs aligned enough with other image-gen providers that downstream blocks/chat can treat `image` / `imageUrl` / `images` the same way. Prefer extending the shared camelCase envelope rather than inventing new top-level keys unless the op requires it (layerize/describe).

---

## 5. Known bug: cost keyed by tool / block, not model name

### Expected behavior

For OpenAI/Gemini, `IMAGE_AGGREGATE_TOOL_IDS` (`image_generate`, etc.) + `resolveEmbeddedToolCostKey` in `apps/sim/lib/logs/embedded-tool-costs.ts` prefer **`output.model`**, so usage logs show e.g. `gpt-image-2`.

Ideogram should attribute by the **picker model / operation name** the user selected (e.g. `generate_v4` / “Generate 4.0”), not by a generic block label or opaque tool id alone.

### Actual behavior

Ideogram tools are **per-operation tool ids** (`ideogram_generate_v4`, …). They are **not** in `IMAGE_AGGREGATE_TOOL_IDS`, so `resolveEmbeddedToolCostKey` returns the raw tool name. Charges land as `ideogram_*` (or surface in UI as block-adjacent labels) instead of a clean model name.

Pricing **math** (operation + speed) is generally correct via `ideogram-pricing.ts`. The bug is **attribution / display key**, not necessarily wrong dollar amounts.

### Suggested fix direction

1. Emit a stable `model` (or billing key) on Ideogram tool output — e.g. picker id `generate_v4` or label “Generate 4.0”.
2. Either:
   - Treat Ideogram like aggregates in `resolveEmbeddedToolCostKey` / `IMAGE_GENERATION_MODEL_IDS`, **or**
   - Map `ideogram_*` → model/op key in `formatEmbeddedToolLabel` / charge description path in `apps/sim/lib/logs/execution/logger.ts` / `logging-factory.ts`.
3. Align chat post-process descriptions the same way (`Ideogram layerize text` vs model-style keys).
4. Add a regression test next to `embedded-tool-costs.test.ts` and `ideogram-pricing.test.ts`.
5. Re-check reconciliation allowlists in `historical-workflow-reconciliation.ts` still match after key changes.

---

## 6. Remaining work (product)

### 6.1 Layerize Text — edit text in the image (priority)

**Today:** Layerize returns erased base + `textBlocks`. Results show in chat/block output. No canvas editor.

**Wanted:** Let the user edit detected text **directly on the image** (position, content, style as Ideogram’s layerize payload allows), then re-export / recompose.

**Entry points:** `ideogram_layerize_text` tool, post-processor + chat ⋯ `layerize_text`, outputs `baseImageUrl` / `textBlocks` on the Post Processor block.

### 6.2 Inpaint in chat with brush (priority)

**Today:** Inpaint 3.0 is on the Image Generator block (image + mask file/URL params). Not in the chat ⋯ menu.

**Wanted:** In chat, highlight regions with a brush to build a mask, then call inpaint (prompt + mask) and append the result like other post-process ops.

**Entry points:** `ideogram_inpaint_v3`, `image-post-process-menu.tsx`, likely extend `post-process/route.ts` + contract to accept mask upload / stroke data.

### 6.3 KJ-nodes-style JSON prompt generator (non-priority)

**Today:** Generate 4.0 accepts `jsonPrompt`; `ideogram_magic_prompt_v4` and Describe can produce structured prompts. No visual KJNodes-parity builder.

**Wanted (extra):** UI to build Ideogram JSON prompts in a ComfyUI KJNodes-like style for Generate 4.0.

**Note:** Older commits on `feat/ideogram` experimented with a prompt builder; do not assume that UI still exists on `feat/ideogram-image-gen`—verify before reviving.

### 6.4 Other polish (recommended)

- **Docs:** Localized Image Generator docs are still DALL·E-centric; English tool page may be missing. Update `apps/docs` for Ideogram provider + Post Processor.
- **Registered-but-hidden tools:** generate_v3, remix_v3, replace_background, async/poll, magic_prompt — decide productize vs leave as agent-only/API.
- **Output format consistency** across OpenAI / Gemini / Ideogram (see §4).
- **Migration 0262** must be applied wherever chat post-process usage is recorded (`image-post-process` enum value).

---

## 7. Test plan

### Manual

1. **Agent + usage logs**
   - Put Image Generator (Ideogram / Generate 4.0) on an agent.
   - Ask the agent to generate an image.
   - Confirm image persists and `usage_log` rows appear with correct **dollar** amount (hosted key).
   - **Known fail:** description/key may still be tool/block-style, not model name (§5).

2. **Image Generator ops**
   - Generate 4.0 (various rendering speeds).
   - Transparent background toggle.
   - Remix 4.0 with an input image.
   - Inpaint 3.0 with image + mask (block).

3. **Post Processor + chat ⋯**
   - Run Describe / Layerize / Reframe / Remove BG / Upscale from the block and from the chat ⋯ menu on a **stored** (internal) generated image.
   - Confirm chat appends results and usage uses `source: image-post-process`.

4. **Output format**
   - Compare `image` / `imageUrl` / `images` across Ideogram models and vs OpenAI/Gemini generators; downstream consumers should not special-case Ideogram for the happy path.

5. **BYOK vs hosted**
   - With `IDEOGRAM_API_KEY` set → hosted billing.
   - With workspace BYOK only → $0 platform cost, call still succeeds.

### Automated

```bash
cd apps/sim && bunx vitest run \
  lib/image-generation/ideogram-pricing.test.ts \
  lib/image-generation/ideogram-fields.test.ts \
  lib/image-generation/ideogram-post-processor-fields.test.ts \
  lib/image-generation/block-model-config.test.ts \
  app/api/tools/ideogram/post-process/route.test.ts \
  blocks/blocks/image_generator.test.ts \
  providers/utils.test.ts \
  lib/logs/embedded-tool-costs.test.ts
```

---

## 8. Key file map (quick navigation)

```
apps/sim/tools/ideogram/          # Tool defs + createIdeogramProxyTool
apps/sim/lib/image-generation/    # Fields, pricing, block model config
apps/sim/blocks/blocks/image_generator.ts
apps/sim/blocks/blocks/image_post_processor.ts
apps/sim/app/api/tools/ideogram/  # Proxy + post-process + server-utils
apps/sim/lib/api/contracts/tools/ideogram.ts
apps/sim/hooks/queries/ideogram-post-process.ts
.../chat-message/image-post-process-menu.tsx
apps/sim/lib/logs/embedded-tool-costs.ts   # Cost key bug lives here (vs OpenAI path)
packages/db/migrations/0262_image_post_process_usage_source.sql
```

---

## 9. Related work in this repo (same owner)

Not Ideogram-specific, but useful context for whoever inherits the area:

| Area | Branches / docs | Notes |
|------|-----------------|-------|
| **AI usage / billing attribution** | `feat/ai-usage`, `feat/ai-usage-ghcr`, `feat/user-ai-usage` | Arena cost remediation, mothership chat attribution, reconcile scripts, ledger UX |
| **Usage attribution docs** | `docs/usage-attribution/`, `docs/billing/mothership-double-count-audit.md` | Phase 0–5 findings; many local `reconcile-*.ndjson` artifacts are untracked audit outputs—do not commit secrets |
| **Video generator** | `fix/video-generator` history | Hosted Fal.ai as video provider |
| **Deploy / GHCR** | `docker-compose.p2prod.yml`, CI | Pin p2prod to GHCR tags; env passthrough including `IDEOGRAM_API_KEY` |
| **Arena UX** | small fixes on image-gen branch | e.g. Back to Arena agents after `/workspace` |

If continuing billing work: read `docs/usage-attribution/phase0-arena-cost-audit-findings.md` and `.cursor/plans/cost_gap_remediation_*.plan.md` before changing ledger writers.

---

## 10. Handover checklist for the next owner

- [ ] Pull `feat/ideogram-image-gen` and run unit tests in §7.
- [ ] Confirm `IDEOGRAM_API_KEY` (or BYOK) in local + p2prod.
- [ ] Confirm migration `0262` applied on target DBs.
- [ ] Reproduce cost-key bug (§5) and decide billing key convention (`generate_v4` vs display label).
- [ ] Spike Layerize in-image editor UX against Ideogram’s `textBlocks` payload.
- [ ] Spike chat brush → mask → `inpaint_v3` (reuse post-process route pattern).
- [ ] Park KJNodes prompt builder unless product prioritizes it.
- [ ] Update docs site for Ideogram + Image Post Processor.
- [ ] Do not merge local `reconcile-*.ndjson` / `mothership-*.ndjson` audit dumps unless scrubbed and intentional.

---

## 11. Contacts / references

- Ideogram API pricing (source for `ideogram-pricing.ts`): https://ideogram.ai/features/api-pricing  
- Shared image-gen path (non-Ideogram): `apps/sim/lib/image-generation/run-image-tool.server.ts`, `/api/tools/image-generation`  
- Hosted tool cost pattern: `tool.hosting.pricing.getCost` → execution logger charges  

Questions about intent for Layerize edit / chat inpaint / cost labels should be treated as **product** decisions; the implementation seams above are ready for those features.

# Local Copilot vLLM Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single **vLLM** option to the Local Copilot model picker that routes through the existing OpenAI-compatible client using `COPILOT_BASE_URL` + `COPILOT_MODEL`.

**Architecture:** Extend `LOCAL_COPILOT_CATALOG` with a `vllm` group/entry (`provider: 'openai-compatible'`, `model: null`). Fix `buildLocalCopilotConfigForCatalog` so openai-compatible catalog selections always take `baseUrl`/`model` from env (even when `COPILOT_PROVIDER` is still `anthropic`). Tighten `assertLocalCopilotEnabled` to require those env vars for openai-compatible. The home picker already renders groups from `LOCAL_COPILOT_PROVIDER_GROUPS` — no UI component changes.

**Tech Stack:** TypeScript, Vitest (`bun run test` in `apps/sim`), existing `createOpenAiCompatibleProvider`.

**Spec:** `docs/superpowers/specs/2026-08-11-local-copilot-vllm-picker-design.md`

## Global Constraints

- Catalog id and group id are exactly `vllm` (lowercase).
- Provider wire id remains `openai-compatible` — do **not** use the workflow-agent provider id `vllm`.
- Single picker leaf; no multi-model rows; no `/v1/models` fetch.
- Default catalog id stays `claude`.
- Do not change context-budget / 120k soft cap.
- Package manager: `bun` / `bunx` only.
- Tests: Vitest with `@vitest-environment node`; static imports + `vi.stubEnv` / `beforeEach` restore — no `vi.resetModules()` / `vi.doMock()`.

## File structure

| File | Responsibility |
|------|----------------|
| `apps/sim/local-copilot/lib/model-catalog.ts` | Add `vllm` group type, catalog entry, provider-group chip |
| `apps/sim/local-copilot/lib/config.ts` | Resolve env model/baseUrl for openai-compatible catalog; assert missing env |
| `apps/sim/local-copilot/lib/model-catalog.test.ts` | Catalog allowlist / group tests (create) |
| `apps/sim/local-copilot/lib/config.test.ts` | Catalog→config + assert tests (create) |
| `apps/sim/app/workspace/.../user-input.tsx` | No code change expected (reads groups dynamically) |

---

### Task 1: Catalog — `vllm` group + leaf

**Files:**
- Modify: `apps/sim/local-copilot/lib/model-catalog.ts`
- Create: `apps/sim/local-copilot/lib/model-catalog.test.ts`

**Interfaces:**
- Consumes: existing `LocalCopilotProviderId` (includes `'openai-compatible'`)
- Produces: catalog id `'vllm'`; group `'vllm'`; `isLocalCopilotCatalogId('vllm') === true`; `getLocalCopilotCatalogEntriesForGroup('vllm')` returns one entry with `provider: 'openai-compatible'` and `model: null`

- [ ] **Step 1: Write the failing tests**

Create `apps/sim/local-copilot/lib/model-catalog.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  getLocalCopilotCatalogEntriesForGroup,
  getLocalCopilotCatalogEntry,
  isLocalCopilotCatalogId,
  LOCAL_COPILOT_PROVIDER_GROUPS,
  resolveLocalCopilotCatalogEntry,
} from '@/local-copilot/lib/model-catalog'

describe('local copilot model catalog — vllm', () => {
  it('allowlists catalog id vllm', () => {
    expect(isLocalCopilotCatalogId('vllm')).toBe(true)
  })

  it('exposes a vllm provider group chip', () => {
    expect(LOCAL_COPILOT_PROVIDER_GROUPS.some((group) => group.id === 'vllm')).toBe(true)
    expect(LOCAL_COPILOT_PROVIDER_GROUPS.find((group) => group.id === 'vllm')?.label).toBe('vLLM')
  })

  it('maps vllm leaf to openai-compatible with null model', () => {
    const entry = getLocalCopilotCatalogEntry('vllm')
    expect(entry).toMatchObject({
      id: 'vllm',
      providerGroup: 'vllm',
      label: 'vLLM',
      provider: 'openai-compatible',
      model: null,
    })
    expect(getLocalCopilotCatalogEntriesForGroup('vllm')).toHaveLength(1)
    expect(resolveLocalCopilotCatalogEntry('vllm').provider).toBe('openai-compatible')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/sim && bun run test local-copilot/lib/model-catalog.test.ts
```

Expected: FAIL (e.g. `isLocalCopilotCatalogId('vllm')` is false / type or group missing).

- [ ] **Step 3: Minimal catalog implementation**

In `apps/sim/local-copilot/lib/model-catalog.ts`:

1. Extend the group union:

```typescript
export type LocalCopilotProviderGroup = 'claude' | 'gemini' | 'bedrock' | 'vllm'
```

2. Append this entry to `LOCAL_COPILOT_CATALOG` (after the last Bedrock entry, before `] as const`):

```typescript
  {
    id: 'vllm',
    providerGroup: 'vllm',
    label: 'vLLM',
    provider: 'openai-compatible' as LocalCopilotProviderId,
    model: null as string | null,
  },
```

3. Append to `LOCAL_COPILOT_PROVIDER_GROUPS`:

```typescript
  { id: 'vllm', label: 'vLLM' },
```

4. Update the TSDoc on `LocalCopilotCatalogEntry.model` to:

```typescript
  /**
   * Concrete provider model id. `null` for Claude and vLLM — resolved from
   * `COPILOT_MODEL` at config-build time.
   */
  model: string | null
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd apps/sim && bun run test local-copilot/lib/model-catalog.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/sim/local-copilot/lib/model-catalog.ts apps/sim/local-copilot/lib/model-catalog.test.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): add vLLM entry to model picker catalog

EOF
)"
```

---

### Task 2: Config resolution + assert for vLLM / openai-compatible

**Files:**
- Modify: `apps/sim/local-copilot/lib/config.ts`
- Create: `apps/sim/local-copilot/lib/config.test.ts`

**Interfaces:**
- Consumes: `resolveLocalCopilotCatalogEntry('vllm')` → `{ provider: 'openai-compatible', model: null, ... }`
- Produces:
  - `buildLocalCopilotConfigForCatalog('vllm')` → `{ provider: 'openai-compatible', model: <COPILOT_MODEL>, baseUrl: <COPILOT_BASE_URL>, specialistModel: <COPILOT_SPECIALIST_MODEL or model>, ... }` even when `COPILOT_PROVIDER=anthropic`
  - `assertLocalCopilotEnabled(config)` throws if openai-compatible config lacks `baseUrl` or `model`

- [ ] **Step 1: Write the failing tests**

Create `apps/sim/local-copilot/lib/config.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertLocalCopilotEnabled,
  buildLocalCopilotConfigForCatalog,
} from '@/local-copilot/lib/config'

describe('buildLocalCopilotConfigForCatalog — vllm', () => {
  const envKeys = [
    'COPILOT_PROVIDER',
    'COPILOT_MODEL',
    'COPILOT_BASE_URL',
    'COPILOT_SPECIALIST_MODEL',
    'COPILOT_ENABLED',
    'OPENAI_API_KEY',
  ] as const

  const previous = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const key of envKeys) {
      previous.set(key, process.env[key])
    }
    vi.stubEnv('COPILOT_PROVIDER', 'anthropic')
    vi.stubEnv('COPILOT_MODEL', 'Qwen3-Next-80B-A3B-Instruct')
    vi.stubEnv('COPILOT_BASE_URL', 'http://127.0.0.1:8000/v1')
    vi.stubEnv('COPILOT_ENABLED', 'true')
    delete process.env.COPILOT_SPECIALIST_MODEL
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const key of envKeys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('routes vllm catalog to openai-compatible with env baseUrl and model', () => {
    const config = buildLocalCopilotConfigForCatalog('vllm')
    expect(config.provider).toBe('openai-compatible')
    expect(config.model).toBe('Qwen3-Next-80B-A3B-Instruct')
    expect(config.baseUrl).toBe('http://127.0.0.1:8000/v1')
    expect(config.specialistModel).toBe('Qwen3-Next-80B-A3B-Instruct')
  })

  it('honors COPILOT_SPECIALIST_MODEL for vllm', () => {
    vi.stubEnv('COPILOT_SPECIALIST_MODEL', 'small-specialist')
    const config = buildLocalCopilotConfigForCatalog('vllm')
    expect(config.specialistModel).toBe('small-specialist')
  })

  it('assertLocalCopilotEnabled requires COPILOT_BASE_URL for openai-compatible', () => {
    const config = buildLocalCopilotConfigForCatalog('vllm')
    expect(() => assertLocalCopilotEnabled({ ...config, baseUrl: undefined })).toThrow(
      /COPILOT_BASE_URL/
    )
  })

  it('assertLocalCopilotEnabled requires COPILOT_MODEL for openai-compatible', () => {
    const config = buildLocalCopilotConfigForCatalog('vllm')
    expect(() => assertLocalCopilotEnabled({ ...config, model: '' })).toThrow(/COPILOT_MODEL/)
  })

  it('assertLocalCopilotEnabled allows configured vllm', () => {
    const config = buildLocalCopilotConfigForCatalog('vllm')
    expect(() => assertLocalCopilotEnabled(config)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/sim && bun run test local-copilot/lib/config.test.ts
```

Expected: FAIL — today `baseUrl` is dropped when `COPILOT_PROVIDER !== openai-compatible`, and null-model openai-compatible falls back to `entry.id` (`'vllm'`) instead of `COPILOT_MODEL`. Assert currently returns early without checking env.

- [ ] **Step 3: Minimal config implementation**

In `apps/sim/local-copilot/lib/config.ts`, replace `buildLocalCopilotConfigForCatalog` with:

```typescript
export function buildLocalCopilotConfigForCatalog(
  catalogId: LocalCopilotCatalogId = DEFAULT_LOCAL_COPILOT_CATALOG_ID
): LocalCopilotConfig {
  const base = getLocalCopilotConfig()
  const entry = resolveLocalCopilotCatalogEntry(catalogId)

  let model: string
  if (entry.model?.trim()) {
    model = entry.model.trim()
  } else if (entry.provider === 'anthropic') {
    model = process.env.COPILOT_MODEL?.trim() || DEFAULT_MODEL
  } else if (entry.provider === 'openai-compatible') {
    model = process.env.COPILOT_MODEL?.trim() || ''
  } else {
    model = entry.id
  }

  const specialistOverride =
    entry.provider === 'anthropic' || entry.provider === 'openai-compatible'
      ? process.env.COPILOT_SPECIALIST_MODEL
      : undefined

  const specialistModel = resolveSpecialistModel(entry.provider, model, specialistOverride)

  const baseUrl =
    entry.provider === 'openai-compatible'
      ? process.env.COPILOT_BASE_URL?.trim() || undefined
      : entry.provider === base.provider
        ? base.baseUrl
        : undefined

  return {
    enabled: base.enabled,
    provider: entry.provider,
    model,
    specialistModel,
    apiKey: resolveApiKey(entry.provider),
    baseUrl,
    region: entry.provider === 'bedrock' ? resolveBedrockRegion() : undefined,
  }
}
```

Replace the openai-compatible branch inside `assertLocalCopilotEnabled` with:

```typescript
  if (config.provider === 'openai-compatible') {
    if (!config.baseUrl?.trim()) {
      throw new Error(
        'vLLM is not configured on this server. Set COPILOT_BASE_URL (e.g. http://localhost:8000/v1).'
      )
    }
    if (!config.model?.trim()) {
      throw new Error(
        'vLLM is not configured on this server. Set COPILOT_MODEL to the exact model id served by vLLM.'
      )
    }
    return
  }
```

Do not change Anthropic / Gemini / Bedrock assert behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd apps/sim && bun run test local-copilot/lib/config.test.ts local-copilot/lib/model-catalog.test.ts
```

Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
git add apps/sim/local-copilot/lib/config.ts apps/sim/local-copilot/lib/config.test.ts
git commit -m "$(cat <<'EOF'
feat(local-copilot): route vLLM picker selection via COPILOT_BASE_URL

EOF
)"
```

---

### Task 3: Manual wiring check + env smoke notes

**Files:**
- Modify: none required if Task 1–2 pass (picker is data-driven)
- Optional verify-only: `apps/sim/app/workspace/[workspaceId]/home/components/user-input/user-input.tsx` (confirm it maps `LOCAL_COPILOT_PROVIDER_GROUPS` — do not edit unless a hardcoded group list exists)

**Interfaces:**
- Consumes: catalog + config from Tasks 1–2
- Produces: operator-ready env checklist (no new runtime API)

- [ ] **Step 1: Confirm picker is data-driven**

Open `apps/sim/app/workspace/[workspaceId]/home/components/user-input/user-input.tsx` and verify `LocalCopilotModelPicker` iterates `LOCAL_COPILOT_PROVIDER_GROUPS` / `getLocalCopilotCatalogEntriesForGroup`. If it hardcodes Claude/Gemini/Bedrock only, add `vllm` the same way those groups are rendered. Prefer no change.

- [ ] **Step 2: Document env for local smoke (comment in commit body only — do not add markdown docs unless asked)**

Operator env for smoke:

```bash
COPILOT_BASE_URL=http://localhost:8000/v1
COPILOT_MODEL=<exact served model id from vLLM>
# optional:
# OPENAI_API_KEY=unused
# COPILOT_SPECIALIST_MODEL=...
```

Manual smoke (when vLLM is running):

1. Restart `bun run dev:full` so env is loaded.
2. Open Local Copilot → picker shows **vLLM**.
3. Select vLLM → send a short message → request hits `{COPILOT_BASE_URL}/chat/completions` with `model: COPILOT_MODEL`.
4. Switch back to Claude → still uses Anthropic credentials (regression).

- [ ] **Step 3: Commit only if Step 1 required a UI fix**

If a UI fix was needed:

```bash
git add apps/sim/app/workspace/[workspaceId]/home/components/user-input/user-input.tsx
git commit -m "$(cat <<'EOF'
fix(local-copilot): show vLLM group in model picker UI

EOF
)"
```

If no code change, skip commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Catalog group `vllm` + leaf `vllm` | Task 1 |
| Provider `openai-compatible`, `model: null` | Task 1 |
| `baseUrl` from `COPILOT_BASE_URL` even when env provider differs | Task 2 |
| Model from `COPILOT_MODEL` | Task 2 |
| Specialist override via `COPILOT_SPECIALIST_MODEL` | Task 2 |
| Assert missing baseUrl / model | Task 2 |
| UI picker shows group (data-driven) | Task 1 + Task 3 verify |
| No agent-block `vllm` provider reuse | Task 2 keeps `openai-compatible` |
| Tests for catalog + config | Tasks 1–2 |
| Default remains `claude` | Unchanged |

## Placeholder / consistency review

- No TBD steps; exact file paths and code included.
- Catalog id / provider strings consistent: `'vllm'` vs `'openai-compatible'`.
- Error messages mention `COPILOT_BASE_URL` / `COPILOT_MODEL` so assert tests’ `/COPILOT_BASE_URL/` and `/COPILOT_MODEL/` regexes match.

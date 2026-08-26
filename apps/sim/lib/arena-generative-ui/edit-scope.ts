import Anthropic from '@anthropic-ai/sdk'
import type { Spec } from '@json-render/core'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { z } from 'zod'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'
import { collectNavTargets } from '@/lib/arena-generative-ui/validate-manifest'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUiEditScope')

const DEFAULT_MODEL = 'claude-sonnet-4-6'
/** Scope output is a handful of page paths and flags, never a spec. */
const SCOPE_OUTPUT_TOKENS = 1_024
const MAX_SCOPE_ATTEMPTS = 2

/**
 * Pages a single scoped edit may rewrite. Past this the input saving no longer
 * justifies the risk of a partial reply, so the edit takes the full path.
 */
export const MAX_SCOPED_EDIT_PAGES = 3

/**
 * Smallest manifest worth scoping. On a one or two page app the scoping round
 * trip costs more than the tokens it saves.
 */
export const MIN_PAGES_FOR_SCOPED_EDIT = 3

const pagePathSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN, 'path must be kebab-case')

const editScopeSchema = z.object({
  mode: z.enum(['pages', 'global']),
  pages: z.array(pagePathSchema).max(12).default([]),
  /** False only when the change request adds or removes a page. */
  pageSetStable: z.boolean(),
  touchesActions: z.boolean().default(false),
  touchesTheme: z.boolean().default(false),
})

export type ArenaGenerativeEditScope = z.output<typeof editScopeSchema>

const SCOPE_SYSTEM_PROMPT = [
  'You decide which pages of an existing multi-page app a change request touches. Output one JSON object. No markdown fences, no explanation.',
  'Operators name the thing they see — "the search box", "the score", "Open on a row" — more often than a page path. Map those to pages from the index (titles, components, onLoad, navigatesTo). "the form" / search / generate is usually home; "the answer" / output / score / results table is usually the destination of that submit; a row, Open, or history is the list page. Include every page that change actually mutates (a submit-label tweak is home only; "show X on results" is results; moving waiting chrome off the form is both).',
  'Shape: { "mode": "pages" | "global", "pages": string[], "pageSetStable": boolean, "touchesActions": boolean, "touchesTheme": boolean }',
  'mode "pages": the change is confined to specific pages. List their paths in "pages".',
  'mode "global": the change is about branding, theme, colour, dark mode, density or typography; or it applies to every page ("all pages", "everywhere", "the whole app"); or it adds or removes a page; or it changes which page opens first; or it rewires actions across pages. Set "pages" to [].',
  'pageSetStable is false when the change adds or removes a page, and true otherwise.',
  'touchesActions is true when the change alters a CTA, which API it calls, its input mapping, or where it navigates on success.',
  'touchesTheme is true when the change names a colour, corner radius, density, typeface, or dark mode.',
  'When you are unsure whether a page is involved, INCLUDE it. Listing an extra page is cheap; omitting the page the user meant makes the edit do nothing.',
  'Never invent a page path. Use only the paths you were given.',
].join('\n')

const SCOPE_REPAIR_USER_MESSAGE =
  'That was not a valid scope object. Return one JSON object with mode, pages, pageSetStable, touchesActions, and touchesTheme. Do not emit page specs or a manifest.'

interface EditScopePageSummary {
  path: string
  title: string
  components: string[]
  onLoad?: string[]
  navigatesTo?: string[]
}

function distinctComponentTypes(spec: Spec): string[] {
  const types = new Set<string>()
  for (const element of Object.values((spec.elements ?? {}) as Record<string, { type?: string }>)) {
    if (typeof element.type === 'string' && element.type) {
      types.add(element.type)
    }
  }
  return [...types].sort((left, right) => left.localeCompare(right))
}

/**
 * Compact description of every page: enough for the scoper to tell which page
 * holds "the search box" or "the results table" without seeing any spec JSON.
 */
export function editScopePageIndex(manifest: ArenaGenerativeAppManifest): EditScopePageSummary[] {
  return Object.values(manifest.pages).map((page) => {
    const navigatesTo = collectNavTargets(page.spec)
    return {
      path: page.path,
      title: page.title,
      components: distinctComponentTypes(page.spec),
      ...(page.onLoad && page.onLoad.length > 0 ? { onLoad: page.onLoad } : {}),
      ...(navigatesTo.length > 0 ? { navigatesTo } : {}),
    }
  })
}

/**
 * Index of the pages a scoped edit must NOT rewrite. Carries their nav targets so
 * the generator can keep cross-page links valid without being shown their specs.
 */
export function unscopedPageIndex(
  manifest: ArenaGenerativeAppManifest,
  scopedPaths: string[]
): EditScopePageSummary[] {
  const scoped = new Set(scopedPaths)
  return editScopePageIndex(manifest).filter((page) => !scoped.has(page.path))
}

/**
 * Validates a model reply as an edit scope, then narrows it to what is safe to
 * act on. Unknown page paths are dropped, and a scope that is empty, covers the
 * whole app, or is simply too large collapses to `global` so the edit takes the
 * full-manifest path instead of a partial one.
 */
export function parseArenaGenerativeEditScope(
  value: unknown,
  options: { manifest: ArenaGenerativeAppManifest }
): ArenaGenerativeEditScope | null {
  const parsed = editScopeSchema.safeParse(value)
  if (!parsed.success) {
    return null
  }
  const scope = parsed.data
  const known = new Set(Object.keys(options.manifest.pages))
  const pages = [...new Set(scope.pages.filter((path) => known.has(path)))]
  const global =
    scope.mode === 'global' ||
    pages.length === 0 ||
    pages.length >= known.size ||
    pages.length > MAX_SCOPED_EDIT_PAGES

  return global ? { ...scope, mode: 'global', pages: [] } : { ...scope, mode: 'pages', pages }
}

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export interface PlanEditScopeParams {
  editInstructions: string
  manifest: ArenaGenerativeAppManifest
  apiBindings: ArenaGenerativeApiBinding[]
}

function scopeUserPayload(params: PlanEditScopeParams): string {
  const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
  return [
    'Mode: scope a change request against an existing app. Do not emit page specs or a manifest.',
    `Pages in this app:\n${JSON.stringify(editScopePageIndex(params.manifest), null, 2)}`,
    `Declared action ids: ${Object.keys(params.manifest.actions).join(', ') || 'none'}`,
    `Declared API binding keys: ${bindingKeys.join(', ') || 'none'}`,
    `Change request:\n${params.editInstructions.trim()}`,
  ].join('\n\n')
}

/**
 * Cheap first-stage call for an edit: decides which pages the change request
 * touches so the manifest call can send and receive only those pages.
 *
 * Returns null when the manifest is too small to be worth scoping or the call
 * fails, in which case the caller runs the existing full-manifest edit. A null
 * result also means the page-set intent is unknown, so callers must not pin page
 * hints from it.
 */
export async function planArenaGenerativeEditScope(
  params: PlanEditScopeParams
): Promise<ArenaGenerativeEditScope | null> {
  const editInstructions = params.editInstructions.trim()
  if (!editInstructions) {
    return null
  }
  if (Object.keys(params.manifest.pages).length < MIN_PAGES_FOR_SCOPED_EDIT) {
    return null
  }

  try {
    const apiKey = getRotatingApiKey('anthropic')
    const anthropic = new Anthropic({
      apiKey,
      timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    })
    const modelId = DEFAULT_MODEL
    const messageOptions = {
      model: modelId,
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), SCOPE_OUTPUT_TOKENS),
      ...(supportsTemperature(modelId) ? { temperature: 0 } : {}),
      system: SCOPE_SYSTEM_PROMPT,
    }
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: scopeUserPayload({ ...params, editInstructions }) },
    ]

    for (let attempt = 0; attempt < MAX_SCOPE_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) {
        continue
      }
      let scope: ArenaGenerativeEditScope | null = null
      try {
        scope = parseArenaGenerativeEditScope(parseLlmJsonObject(rawText), {
          manifest: params.manifest,
        })
      } catch {
        scope = null
      }
      if (scope) {
        return scope
      }
      if (attempt + 1 < MAX_SCOPE_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: rawText },
          { role: 'user', content: SCOPE_REPAIR_USER_MESSAGE }
        )
      }
    }
    logger.warn('Arena Generative UI edit scope was unusable; editing the whole manifest')
    return null
  } catch (error) {
    logger.warn('Arena Generative UI edit scoping failed; editing the whole manifest', {
      error: toError(error).message,
    })
    return null
  }
}

import type { Spec } from '@json-render/core'
import type {
  ArenaGenerativeAdoptedChange,
  ArenaGenerativeGenerateWarning,
} from '@/lib/arena-generative-ui/generate-warnings'
import type { RenderDiagnostic } from '@/lib/arena-generative-ui/render-diagnostics'
import { isActionTelemetryRoot, isJsonRenderSpec } from '@/lib/arena-generative-ui/types'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

export const USER_INPUT_PLACEHOLDER = '{user_input}'

export interface PreviewScreenshotGap {
  observed: string
  closestCatalogType?: string
}

export interface PreviewEditInstructionInput {
  pagePath: string
  diagnostics?: readonly RenderDiagnostic[]
  generateWarnings?: readonly ArenaGenerativeGenerateWarning[]
  adoptedChanges?: readonly ArenaGenerativeAdoptedChange[]
  screenshotGaps?: readonly PreviewScreenshotGap[]
  capabilities?: readonly string[]
  appCatalogTypes?: readonly string[]
  /** Overlay flags (`creating` / `editing`) found on Button setValue or Modal showWhen. */
  overlayFlags?: readonly string[]
  apiBindingKeys?: readonly string[]
}

const HEADER =
  'Paste into Requested Changes. Replace {user_input} with your copy or field name before running Edit.'

function pagePrefix(pagePath: string): string {
  return `On the "${pagePath}" page,`
}

function pageFromAdoptedAsked(asked: string, fallback: string): string {
  const match = asked.match(/on page "([^"]+)"/i)
  return match?.[1] ?? fallback
}

function hasType(types: readonly string[] | undefined, type: string): boolean {
  return Boolean(types?.includes(type))
}

function diagnosticLine(item: RenderDiagnostic, pagePath: string): string {
  const prefix = pagePrefix(pagePath)
  if (item.kind === 'throw') {
    return `${prefix} ${USER_INPUT_PLACEHOLDER} (describe the broken region). The renderer threw: ${item.message}`
  }
  if (item.kind === 'unknown-type') {
    const type = item.message.match(/"([^"]+)"/)?.[1] ?? 'that type'
    const id = item.elementId ?? 'that element'
    return `${prefix} replace "${id}" with a catalog type (Table, Repeat, Card, or DataText). Do not invent ${type}.`
  }
  const id = item.elementId ?? 'that element'
  const path = item.statePath ?? 'that field'
  if (item.statePath && isActionTelemetryRoot(item.statePath)) {
    return `${prefix} remove "${id}" bound to "${path}"; the host strips execution telemetry.`
  }
  return `${prefix} bind "${id}" to ${USER_INPUT_PLACEHOLDER} (a top-level field from the Sample response in Add an API), or add that field to onLoad.`
}

function warningLine(
  warning: ArenaGenerativeGenerateWarning,
  pagePath: string
): string | undefined {
  const prefix = pagePrefix(pagePath)
  switch (warning.code) {
    case 'planner-failed':
      return `Re-plan this app. Name the pages and job as ${USER_INPUT_PLACEHOLDER} (kebab-case paths such as home and results). Keep the APIs already in Add an API.`
    case 'actions-dropped':
      return `${prefix} bind ${USER_INPUT_PLACEHOLDER} to a key from Add an API. The planner dropped an action that was not a declared binding.`
    case 'uncoordinated-regions':
      return `${prefix} name how regions coordinate as ${USER_INPUT_PLACEHOLDER} (selection, inspect, or execution). The planner left Workspace regions uncoordinated.`
    case 'intent-skipped':
      return `${prefix} ${USER_INPUT_PLACEHOLDER} (the one job this page should do).`
    case 'visual-skipped':
      return `${prefix} ${USER_INPUT_PLACEHOLDER} (layout and copy the screenshot should have shown).`
    case 'critic-skipped':
      return `${prefix} ${USER_INPUT_PLACEHOLDER} (one hierarchy or CTA change). Do not add a second primary Button.`
    default:
      return undefined
  }
}

function adoptedLine(change: ArenaGenerativeAdoptedChange, pagePath: string): string | undefined {
  if (change.code !== 'extra-primary') return undefined
  const page = pageFromAdoptedAsked(change.asked, pagePath)
  return `${pagePrefix(page)} keep ${USER_INPUT_PLACEHOLDER} as the only primary CTA and make every other action secondary.`
}

function screenshotLine(gap: PreviewScreenshotGap, pagePath: string): string {
  const closest = gap.closestCatalogType ?? 'Table, Repeat, or Card'
  return `${pagePrefix(pagePath)} do not add a custom "${gap.observed}". Represent it with ${closest}.`
}

function hasOverlayFlag(
  overlayFlags: readonly string[] | undefined,
  flag: string
): boolean {
  return Boolean(overlayFlags?.includes(flag))
}

function capabilityLines(
  capabilities: readonly string[] | undefined,
  appCatalogTypes: readonly string[] | undefined,
  pagePath: string,
  apiBindingKeys: readonly string[] | undefined,
  overlayFlags: readonly string[] | undefined
): string[] {
  if (!capabilities?.length) return []
  const lines: string[] = []
  const prefix = pagePrefix(pagePath)
  const keys = apiBindingKeys?.filter((key) => key.trim().length > 0) ?? []
  const keyHint = keys.length > 0 ? keys[0] : USER_INPUT_PLACEHOLDER
  if (capabilities.includes('chat') && !hasType(appCatalogTypes, 'Chat')) {
    lines.push(
      `${prefix} add a Chat composer with actionId ${keyHint === USER_INPUT_PLACEHOLDER ? USER_INPUT_PLACEHOLDER : `"${keyHint}"`} (a chat API key from Add an API).`
    )
  }
  if (capabilities.includes('search') && !hasType(appCatalogTypes, 'SearchField')) {
    lines.push(
      `${prefix} use a SearchField as the search hero. actionId ${USER_INPUT_PLACEHOLDER} (or omit actionId to filter the table locally).`
    )
  }
  const hasCreateOverlay =
    overlayFlags !== undefined
      ? hasOverlayFlag(overlayFlags, 'creating')
      : hasType(appCatalogTypes, 'Modal')
  if (capabilities.includes('create') && !hasCreateOverlay) {
    lines.push(
      `${prefix} open create in a Modal (Button setValue creating=true, Modal showWhen creating). SubmitButton label ${USER_INPUT_PLACEHOLDER}.`
    )
  }
  if (capabilities.includes('edit') && overlayFlags !== undefined && !hasOverlayFlag(overlayFlags, 'editing')) {
    lines.push(
      `${prefix} open edit in a Modal (row Button setValue editing=true, Modal showWhen editing). Save with editing: false, not creating: false. SubmitButton label ${USER_INPUT_PLACEHOLDER}.`
    )
  }
  return lines
}

/**
 * Catalog types used anywhere in the generated app. Preview uses this to
 * decide which planned capabilities never landed.
 */
export function catalogTypesFromManifest(manifest: ArenaGenerativeAppManifest): string[] {
  const types = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    if (!isJsonRenderSpec(page.spec)) continue
    for (const element of Object.values((page.spec as Spec).elements ?? {})) {
      const type = (element as { type?: string }).type
      if (type) types.add(type)
    }
  }
  return [...types]
}

const OVERLAY_FLAGS = new Set(['creating', 'editing'])

function overlayFlagName(raw: string): string | undefined {
  const name = raw.replace(/^!/, '').split('=')[0]?.trim()
  return name && OVERLAY_FLAGS.has(name) ? name : undefined
}

function collectOverlayFlagsFromProps(props: unknown, flags: Set<string>): void {
  if (!props || typeof props !== 'object') return
  const record = props as Record<string, unknown>
  if (typeof record.showWhen === 'string') {
    for (const token of record.showWhen.split(/[\s,]+/)) {
      const name = overlayFlagName(token)
      if (name) flags.add(name)
    }
  }
  if (typeof record.setValue === 'string') {
    const name = overlayFlagName(record.setValue)
    if (name) flags.add(name)
  }
}

/**
 * Overlay flags used anywhere in the generated app. Preview uses this to
 * tell create from edit when both are Modals.
 */
export function overlayFlagsFromManifest(manifest: ArenaGenerativeAppManifest): string[] {
  const flags = new Set<string>()
  for (const page of Object.values(manifest.pages)) {
    if (!isJsonRenderSpec(page.spec)) continue
    for (const element of Object.values((page.spec as Spec).elements ?? {})) {
      collectOverlayFlagsFromProps((element as { props?: unknown }).props, flags)
    }
  }
  return [...flags]
}

/**
 * Pasteable Requested Changes from generate notes, catalog limits, and
 * live render problems. Placeholders mark copy the author must fill in.
 */
export function buildPreviewEditInstructions(input: PreviewEditInstructionInput): string {
  const lines: string[] = []
  const seen = new Set<string>()
  const push = (line: string | undefined) => {
    const trimmed = line?.trim() ?? ''
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    lines.push(trimmed)
  }

  for (const item of input.diagnostics ?? []) {
    push(diagnosticLine(item, input.pagePath))
  }
  for (const change of input.adoptedChanges ?? []) {
    push(adoptedLine(change, input.pagePath))
  }
  for (const gap of input.screenshotGaps ?? []) {
    push(screenshotLine(gap, input.pagePath))
  }
  for (const line of capabilityLines(
    input.capabilities,
    input.appCatalogTypes,
    input.pagePath,
    input.apiBindingKeys,
    input.overlayFlags
  )) {
    push(line)
  }
  for (const warning of input.generateWarnings ?? []) {
    push(warningLine(warning, input.pagePath))
  }

  if (lines.length === 0) return ''
  return [HEADER, ...lines.map((line) => `- ${line}`)].join('\n')
}

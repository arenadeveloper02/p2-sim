import type { Spec } from '@json-render/core'

const BOUND_TYPES = new Set(['Table', 'Repeat', 'Stat', 'KeyValue', 'DataText'])

export interface RenderDiagnostic {
  kind: 'unresolved-state-path' | 'unknown-type' | 'throw'
  message: string
  elementId?: string
  statePath?: string
}

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * True when the host state has the top-level key a `statePath` needs. Repeat
 * `item.*` paths are in-scope of the row, not host state.
 */
export function hostStateHasRoot(state: Record<string, unknown>, path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed || trimmed === 'item' || trimmed.startsWith('item.')) return true
  const root = trimmed.split('.')[0]
  if (!root) return true
  return Object.hasOwn(state, root)
}

/**
 * Runtime problems a generated spec can hit after load: a bound path whose
 * top-level key never arrived, or a catalog type the renderer does not know.
 * Empty arrays/objects are valid empty states and are not reported.
 */
export function collectRenderDiagnostics(
  spec: Spec,
  state: Record<string, unknown>,
  pending: boolean
): RenderDiagnostic[] {
  if (pending) return []
  const elements = (spec.elements ?? {}) as Record<string, SpecElement>
  const diagnostics: RenderDiagnostic[] = []
  for (const [elementId, element] of Object.entries(elements)) {
    const type = element.type ?? ''
    if (!type) continue
    if (!isKnownRendererType(type)) {
      diagnostics.push({
        kind: 'unknown-type',
        elementId,
        message: `Unknown component type "${type}" on "${elementId}". Use a catalog type.`,
      })
    }
    const statePath = asString(element.props?.statePath)
    if (!statePath || !BOUND_TYPES.has(type)) continue
    if (hostStateHasRoot(state, statePath)) continue
    diagnostics.push({
      kind: 'unresolved-state-path',
      elementId,
      statePath,
      message: `Unresolved statePath "${statePath}" on ${type} "${elementId}". Bind a real top-level response field or add onLoad.`,
    })
  }
  return diagnostics
}

const KNOWN_RENDERER_TYPES = new Set([
  'Page',
  'Section',
  'Stack',
  'Grid',
  'Columns',
  'Repeat',
  'PageHeader',
  'Toolbar',
  'Tabs',
  'Heading',
  'Text',
  'DataText',
  'Alert',
  'List',
  'ListItem',
  'Divider',
  'Image',
  'Table',
  'Stat',
  'KeyValue',
  'Badge',
  'Form',
  'TextInput',
  'TextArea',
  'NumberInput',
  'DateInput',
  'Select',
  'RadioGroup',
  'MultiSelect',
  'Checkbox',
  'Switch',
  'SubmitButton',
  'Skeleton',
  'Spinner',
  'ProgressSteps',
  'NavLink',
  'Button',
  'Link',
  'Card',
])

function isKnownRendererType(type: string): boolean {
  return KNOWN_RENDERER_TYPES.has(type)
}

/**
 * Edit-mode prompt a preview user can paste into Requested Changes.
 */
export function editInstructionsFromDiagnostics(
  diagnostics: RenderDiagnostic[],
  pagePath: string
): string {
  if (diagnostics.length === 0) return ''
  const lines = diagnostics.map((item) => `- ${item.message}`)
  return [`Fix these render problems on page "${pagePath}":`, ...lines].join('\n')
}

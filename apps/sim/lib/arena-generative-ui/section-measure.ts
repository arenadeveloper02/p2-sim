/**
 * Detects a Section whose job is a form or search hero. The host narrows those
 * to the readable measure even when width was omitted or wide.
 */

export interface MeasureElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

export const WIDE_SECTION_CONTENT_TYPES = new Set([
  'Table',
  'Repeat',
  'Calendar',
  'Chart',
  'Sparkline',
  'Workspace',
])

function visibleLayoutChildIds(
  elements: Record<string, MeasureElement>,
  childIds: string[]
): string[] {
  return childIds.filter((id) => {
    const child = elements[id]
    return Boolean(child) && child.type !== 'Modal' && child.type !== 'Drawer'
  })
}

/**
 * True when the Section's job is a stacked Form or SearchField with no
 * collection / table / chart sibling. Explicit width "full" still spans.
 */
export function sectionIsMeasureOnly(
  elements: Record<string, MeasureElement>,
  childIds: string[]
): boolean {
  let hasTaskControl = false
  let hasWideContent = false

  const visit = (ids: string[]) => {
    for (const id of ids) {
      const child = elements[id]
      if (!child) continue
      if (child.type === 'Modal' || child.type === 'Drawer') continue
      if (child.type === 'Form') {
        hasTaskControl = true
        continue
      }
      if (child.type === 'SearchField') {
        hasTaskControl = true
        continue
      }
      if (WIDE_SECTION_CONTENT_TYPES.has(child.type ?? '')) hasWideContent = true
      if (child.type === 'Grid' || child.type === 'Columns') {
        if (visibleLayoutChildIds(elements, child.children ?? []).length >= 2) {
          hasWideContent = true
        }
      }
      visit(child.children ?? [])
    }
  }
  visit(childIds)
  return hasTaskControl && !hasWideContent
}

/**
 * True when a measure-only Section would paint at the 1280px wide default.
 * `full` is an explicit escape; `narrow` already matches the host.
 */
export function sectionWidthNeedsMeasure(width: unknown): boolean {
  const value = typeof width === 'string' ? width.trim() : ''
  return value !== 'narrow' && value !== 'full'
}

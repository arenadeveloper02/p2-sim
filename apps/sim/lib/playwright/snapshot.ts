import type { PlaywrightRefEntry } from '@/lib/playwright/types'

interface A11yNode {
  role?: string
  name?: string
  level?: number
  children?: A11yNode[]
}

const REF_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'searchbox',
  'menuitem',
  'heading',
  'listitem',
  'tab',
  'switch',
])

/**
 * Builds a Playwright MCP-style accessibility snapshot with element refs.
 */
export function buildAccessibilitySnapshot(
  root: A11yNode | null,
  refs: Map<string, PlaywrightRefEntry>
): string {
  const lines: string[] = []
  let refCounter = 0

  const walk = (node: A11yNode | undefined, indent: number) => {
    if (!node?.role) return

    let refTag = ''
    if (REF_ROLES.has(node.role)) {
      refCounter += 1
      const ref = `e${refCounter}`
      refs.set(ref, { role: node.role, name: node.name })
      refTag = ` [ref=${ref}]`
    }

    const padding = '  '.repeat(indent)
    const namePart = node.name ? ` "${node.name}"` : ''
    const levelPart = node.level ? ` [level=${node.level}]` : ''
    lines.push(`${padding}- ${node.role}${namePart}${levelPart}${refTag}`)

    for (const child of node.children ?? []) {
      walk(child, indent + 1)
    }
  }

  walk(root ?? undefined, 0)
  return lines.join('\n')
}

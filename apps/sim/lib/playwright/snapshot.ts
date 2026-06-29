import type { PlaywrightRefEntry } from '@/lib/playwright/types'

const INTERACTIVE_ROLES =
  /^(textbox|button|link|checkbox|radio|combobox|searchbox|menuitem|tab|switch|heading|listitem)(?:\s|$)/

/**
 * Parses Playwright aria snapshot YAML and assigns MCP-style refs to interactive nodes.
 */
export function annotateAriaSnapshotWithRefs(
  snapshot: string,
  refs: Map<string, PlaywrightRefEntry>
): string {
  let refCounter = 0

  return snapshot
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)- ([a-z]+)(.*)$/)
      if (!match) return line

      const [, indent, role, rest] = match
      if (!INTERACTIVE_ROLES.test(role)) return line

      refCounter += 1
      const ref = `e${refCounter}`
      const nameMatch = rest.match(/ "([^"]+)"/)
      refs.set(ref, { role, name: nameMatch?.[1] })

      if (rest.includes(`[ref=${ref}]`)) return line
      return `${indent}- ${role}${rest} [ref=${ref}]`
    })
    .join('\n')
}

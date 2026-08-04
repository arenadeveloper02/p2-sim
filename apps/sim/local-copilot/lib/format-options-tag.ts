import type { OptionsTagData } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'
import { normalizeSingleSelectJsonToOptionsTags } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/choice-blocks'

/** Max clickable follow-ups shown in a single assistant reply. */
export const MAX_SUGGESTED_FOLLOW_UPS = 3

const OPTIONS_TAG_PATTERN = /<options>([\s\S]*?)<\/options>/gi

/**
 * Formats suggested follow-ups as a Mothership-compatible `<options>` tag so
 * {@link parseSpecialTags} renders clickable "Suggested follow-ups" rows.
 */
export function formatOptionsTag(items: string[]): string {
  const unique = [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(
    0,
    MAX_SUGGESTED_FOLLOW_UPS
  )
  if (unique.length === 0) return ''

  const data: OptionsTagData = {}
  unique.forEach((title, index) => {
    data[String(index + 1)] = { title, description: title }
  })

  return `\n\n<options>${JSON.stringify(data)}</options>`
}

/**
 * Removes complete `<options>...</options>` blocks from assistant text.
 */
export function stripOptionsTags(text: string): string {
  return text.replace(OPTIONS_TAG_PATTERN, '').replace(/\n{3,}/g, '\n\n')
}

/**
 * Strips complete options tags and, while streaming, holds back an incomplete
 * trailing `<options` so raw markup never flashes. Also rewrites leaked
 * `single_select` JSON into `<options>` so choice UIs render correctly.
 */
export function stripOptionsTagsForDisplay(text: string, isStreaming = false): string {
  let result = normalizeSingleSelectJsonToOptionsTags(text)
  result = stripOptionsTags(result)
  if (isStreaming) {
    const incompleteIdx = result.search(/<options\b/i)
    if (incompleteIdx !== -1) {
      result = result.slice(0, incompleteIdx)
    }
  }
  return result.replace(/\n{3,}/g, '\n\n')
}

/**
 * Extracts option titles from the last `<options>` tag in text (if any).
 * Also recognizes leaked `single_select` JSON payloads.
 */
export function extractOptionsTitles(text: string): string[] {
  const normalized = normalizeSingleSelectJsonToOptionsTags(text)
  let lastBody: string | null = null
  for (const match of normalized.matchAll(OPTIONS_TAG_PATTERN)) {
    lastBody = match[1] ?? null
  }
  if (!lastBody) return []

  try {
    const data = JSON.parse(lastBody) as OptionsTagData
    const titles: string[] = []
    for (const value of Object.values(data)) {
      if (typeof value?.title === 'string' && value.title.trim()) {
        titles.push(value.title.trim())
      }
    }
    return [...new Set(titles)].slice(0, MAX_SUGGESTED_FOLLOW_UPS)
  } catch {
    return []
  }
}

/**
 * True when the text already contains a complete options tag or single_select JSON.
 */
export function hasOptionsTag(text: string): boolean {
  const normalized = normalizeSingleSelectJsonToOptionsTags(text)
  OPTIONS_TAG_PATTERN.lastIndex = 0
  return OPTIONS_TAG_PATTERN.test(normalized)
}

export { normalizeSingleSelectJsonToOptionsTags } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/choice-blocks'

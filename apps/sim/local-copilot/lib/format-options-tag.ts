import type { OptionsTagData } from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags'

/**
 * Formats suggested follow-ups as a Mothership-compatible `<options>` tag so
 * {@link parseSpecialTags} renders clickable "Suggested follow-ups" rows.
 */
export function formatOptionsTag(items: string[]): string {
  const unique = [...new Set(items.map((item) => item.trim()).filter(Boolean))]
  if (unique.length === 0) return ''

  const data: OptionsTagData = {}
  unique.forEach((title, index) => {
    data[String(index + 1)] = { title, description: title }
  })

  return `\n\n<options>${JSON.stringify(data)}</options>`
}

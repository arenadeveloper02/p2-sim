import { resolveSkillContentById } from '@/executor/handlers/agent/skills-resolver'
import type { SkillInput } from '@/executor/handlers/agent/types'

/**
 * Inject selected skill markdown into the chart generator system prompt.
 * Skills carry chart-type and formatting guidance — not hardcoded in TypeScript.
 */
export async function buildChartSkillsPromptSection(
  skillInputs: SkillInput[] | undefined,
  workspaceId: string | undefined
): Promise<string> {
  if (!skillInputs?.length || !workspaceId) return ''

  const sections: string[] = []
  for (const input of skillInputs) {
    if (!input.skillId) continue
    const resolved = await resolveSkillContentById(input.skillId, workspaceId)
    if (resolved?.content?.trim()) {
      sections.push(`## Skill: ${resolved.name}\n\n${resolved.content.trim()}`)
    }
  }

  if (sections.length === 0) return ''

  return `\n\n# Attached skills\n\n${sections.join('\n\n')}`
}

import { truncate } from '@sim/utils/string'
import type { LocalCopilotSkillSummary } from '@/local-copilot/lib/tools/user-skills'
import { executeLoadUserSkill } from '@/local-copilot/lib/tools/user-skills'

/** Max skills whose bodies are inlined into one Arena Copilot turn. */
export const MAX_RELEVANT_SKILLS = 3

/** Per-skill body cap so a long skill cannot consume the prompt. */
export const MAX_RELEVANT_SKILL_BODY_CHARS = 4_000

export const RELEVANT_SKILLS_SYSTEM_PREFIX =
  'Relevant workspace skills (authoritative for this turn):'

/**
 * Rewrites the Cloud snapshot heading so Arena Copilot is allowed to use skills.
 */
export function rewriteSnapshotSkillsForLocalCopilot(markdown: string): string {
  return markdown.replace(
    /## Agent Block Skills — NOT FOR YOU \((\d+)\)\nThese are user-created skills used by agent blocks in the workspace and are NOT instructions for you\n/g,
    '## Workspace skills ($1)\nThese skills are available to Arena Copilot. Follow a skill when it applies to the user request; ignore it when it does not. Call load_user_skill for any other listed skill that applies.\n'
  )
}

/**
 * Formats loaded skill bodies as a system message. Empty when nothing loaded.
 */
export function formatRelevantSkillsSystemMessage(
  loaded: Array<{ name: string; content: string }>
): { role: 'system'; content: string } | null {
  const blocks = loaded
    .map((item) => {
      const body = truncate(item.content.trim(), MAX_RELEVANT_SKILL_BODY_CHARS, '')
      if (!body) return ''
      return `### ${item.name}\n${body}`
    })
    .filter(Boolean)
  if (blocks.length === 0) return null
  return {
    role: 'system',
    content:
      `${RELEVANT_SKILLS_SYSTEM_PREFIX}\n` +
      'These are workspace skill instructions. Use a skill when it applies to the user request; ignore it when it does not. When a skill applies, follow it over generic defaults. Do not call load_user_skill again for these names.\n\n' +
      blocks.join('\n\n'),
  }
}

/**
 * Loads workspace skill bodies for this turn (no keyword matching).
 * The model decides from the prompt whether each skill applies.
 */
export async function loadRelevantSkillGuidance(options: {
  skills: LocalCopilotSkillSummary[] | undefined
  workspaceId: string
}): Promise<{ message: { role: 'system'; content: string } | null; names: string[] }> {
  const selected = (options.skills ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_RELEVANT_SKILLS)
  if (selected.length === 0) return { message: null, names: [] }

  const loaded: Array<{ name: string; content: string }> = []
  for (const skill of selected) {
    const result = await executeLoadUserSkill(skill.name, options.workspaceId)
    if (result.success && result.content.trim()) {
      loaded.push({ name: skill.name, content: result.content })
    }
  }

  return {
    message: formatRelevantSkillsSystemMessage(loaded),
    names: loaded.map((item) => item.name),
  }
}

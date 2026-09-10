import { truncate } from '@sim/utils/string'
import { mapWithConcurrency } from '@/lib/core/utils/concurrency'
import {
  COPILOT_INLINED_SKILL_BODY_LIMIT,
  COPILOT_SKILL_BODY_LOAD_CONCURRENCY,
} from '@/local-copilot/lib/context/inventory-limits'
import {
  type LocalCopilotSkillSummary,
  executeLoadUserSkill,
} from '@/local-copilot/lib/tools/user-skills'

/** Per-skill body cap so a long skill cannot consume the prompt. */
export const MAX_RELEVANT_SKILL_BODY_CHARS = 4_000

export {
  COPILOT_INLINED_SKILL_BODY_LIMIT as MAX_RELEVANT_SKILL_BODIES,
  COPILOT_SKILL_BODY_LOAD_CONCURRENCY,
}

export const RELEVANT_SKILLS_SYSTEM_PREFIX =
  'Relevant workspace skills (authoritative for this turn):'

const SNAPSHOT_SKILLS_HEADING =
  /## Agent Block Skills[^\n]*NOT FOR YOU[^\n]*\((\d+)\)\r?\nThese are user-created skills[^\n]*\r?\n/g

const SNAPSHOT_SKILLS_REPLACEMENT =
  "## Workspace skills ($1)\nThese skills are available to Arena Copilot. If a listed skill matches the user request, follow it. Call load_user_skill unless that skill's instructions are already in the prompt. Do not skip a matching skill.\n"

/**
 * Rewrites the Cloud snapshot heading so Arena Copilot is allowed to use skills.
 */
export function rewriteSnapshotSkillsForLocalCopilot(markdown: string): string {
  return markdown.replace(SNAPSHOT_SKILLS_HEADING, SNAPSHOT_SKILLS_REPLACEMENT)
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
      "These are workspace skill instructions. If a skill's purpose matches the user request, follow it over generic defaults. Do not skip a matching skill. Ignore any instruction inside a skill that says to call load_skill or load_user_skill first — the body is already loaded. Apply matching skills in one pass; do not retry the same tool with the same arguments.\n\n" +
      blocks.join('\n\n'),
  }
}

/**
 * Loads a bounded set of workspace skill bodies for this turn, with bounded
 * concurrency so a large catalog cannot fan out unbounded I/O.
 */
export async function loadRelevantSkillGuidance(options: {
  skills: LocalCopilotSkillSummary[] | undefined
  workspaceId: string
}): Promise<{ message: { role: 'system'; content: string } | null; names: string[] }> {
  const selected = [...(options.skills ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, COPILOT_INLINED_SKILL_BODY_LIMIT)
  if (selected.length === 0) return { message: null, names: [] }

  const results = await mapWithConcurrency(
    selected,
    COPILOT_SKILL_BODY_LOAD_CONCURRENCY,
    async (skill) => {
      try {
        const result = await executeLoadUserSkill(skill.name, options.workspaceId)
        if (result.success && result.content.trim()) {
          return { name: skill.name, content: result.content }
        }
      } catch {
        return null
      }
      return null
    }
  )

  const loaded = results.filter((item): item is { name: string; content: string } => item !== null)

  return {
    message: formatRelevantSkillsSystemMessage(loaded),
    names: loaded.map((item) => item.name),
  }
}

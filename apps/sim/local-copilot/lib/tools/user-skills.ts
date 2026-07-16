import { db } from '@sim/db'
import { skill } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { resolveSkillContent } from '@/executor/handlers/agent/skills-resolver'
import { LOAD_USER_SKILL_TOOL_NAME } from '@/lib/mothership/skills'
import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotUserSkills')

/** Max skill summaries injected into Arena Copilot context. */
const MAX_CONTEXT_SKILLS = 100

export interface LocalCopilotSkillSummary {
  id: string
  name: string
  description: string
}

/**
 * Builds the load_user_skill tool for Arena Copilot when the workspace has
 * user-created skills. Mirrors Cloud/Mothership `buildUserSkillTool`.
 */
export async function buildLocalCopilotUserSkillTool(
  workspaceId: string
): Promise<LocalCopilotToolDefinition | null> {
  if (!workspaceId) return null

  let rows: { name: string; description: string }[]
  try {
    rows = await db
      .select({ name: skill.name, description: skill.description })
      .from(skill)
      .where(eq(skill.workspaceId, workspaceId))
  } catch (error) {
    logger.error('Failed to load workspace skills for load_user_skill tool', {
      error,
      workspaceId,
    })
    return null
  }

  if (rows.length === 0) return null

  const skillNames = rows.map((row) => row.name)
  const catalog = rows.map((row) => `- ${row.name}: ${row.description}`).join('\n')

  return {
    name: LOAD_USER_SKILL_TOOL_NAME,
    description: `Load a user-created skill's full instructions. You MUST call this before following a skill: the list below only tells you which skills exist and when each applies — it is NOT the instructions. To use a skill, call load_user_skill with its exact name and follow the content it returns; never act on a skill's name or description alone. Available skills:\n${catalog}`,
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'Exact name of the user skill to load.',
          enum: skillNames,
        },
      },
      required: ['skill_name'],
      additionalProperties: false,
    },
  }
}

/**
 * Loads lightweight skill metadata for Arena Copilot context injection.
 * User-created workspace skills only (no code-only builtins).
 */
export async function loadWorkspaceSkillSummaries(
  workspaceId: string
): Promise<LocalCopilotSkillSummary[]> {
  if (!workspaceId) return []

  try {
    const rows = await db
      .select({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      })
      .from(skill)
      .where(eq(skill.workspaceId, workspaceId))
      .limit(MAX_CONTEXT_SKILLS)

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }))
  } catch (error) {
    logger.warn('Failed to load workspace skill summaries for context', {
      error,
      workspaceId,
    })
    return []
  }
}

/**
 * Resolves full skill instructions for a load_user_skill tool call.
 */
export async function executeLoadUserSkill(
  skillName: string,
  workspaceId: string
): Promise<{ success: true; content: string } | { success: false; error: string }> {
  if (!skillName || !workspaceId) {
    return { success: false, error: 'Missing skill_name or workspace context' }
  }

  const content = await resolveSkillContent(skillName, workspaceId)
  if (!content) {
    return { success: false, error: `Skill "${skillName}" not found` }
  }

  return { success: true, content }
}

export { LOAD_USER_SKILL_TOOL_NAME }

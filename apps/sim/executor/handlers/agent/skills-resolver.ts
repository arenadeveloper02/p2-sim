import { db } from '@sim/db'
import { skill } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { resolveSelectedSkillNodes } from '@/lib/workflows/skills/operations'
import type { SkillInput } from '@/executor/handlers/agent/types'

const logger = createLogger('SkillsResolver')

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface SkillNodeMetadata {
  id: string
  path: string
  type: 'folder' | 'skill' | 'file'
  name: string
  description: string | null
}

export interface SkillMetadata {
  id: string
  name: string
  description: string
  nodes: SkillNodeMetadata[]
}

/**
 * Fetch skill metadata (name + description) for system prompt injection.
 * Only returns lightweight data so the LLM knows what skills are available.
 */
export async function resolveSkillMetadata(
  skillInputs: SkillInput[],
  workspaceId: string
): Promise<SkillMetadata[]> {
  if (!skillInputs.length || !workspaceId) return []

  try {
    const packs = await resolveSelectedSkillNodes({ selections: skillInputs, workspaceId })
    return packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      nodes: pack.nodes.map((node) => ({
        id: node.id,
        path: node.path,
        type: node.type,
        name: node.name,
        description: node.description,
      })),
    }))
  } catch (error) {
    logger.error('Failed to resolve skill metadata', {
      error,
      skillIds: skillInputs.map((s) => s.skillId),
      workspaceId,
    })
    return []
  }
}

/**
 * Fetch full skill content for a load_skill tool response.
 * Called when the LLM decides a skill is relevant and invokes load_skill.
 */
export async function resolveSkillContent(
  skillName: string,
  workspaceId: string
): Promise<string | null> {
  if (!skillName || !workspaceId) return null

  try {
    const rows = await db
      .select({ content: skill.content, name: skill.name })
      .from(skill)
      .where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, skillName)))
      .limit(1)

    if (rows.length === 0) {
      logger.warn('Skill not found', { skillName, workspaceId })
      return null
    }

    return rows[0].content
  } catch (error) {
    logger.error('Failed to resolve skill content', { error, skillName, workspaceId })
    return null
  }
}

/**
 * Build the system prompt section that lists available skills.
 * Uses XML format per the agentskills.io integration guide.
 */
export function buildSkillsSystemPromptSection(skills: SkillMetadata[]): string {
  if (!skills.length) return ''

  const skillEntries = skills
    .map((s) => {
      const nodeEntries = s.nodes
        .filter((node) => node.type !== 'file')
        .slice(0, 40)
        .map(
          (node) =>
            `    <node path="${escapeXml(node.path)}" type="${escapeXml(node.type)}" name="${escapeXml(
              node.name
            )}">\n      <description>${escapeXml(node.description ?? '')}</description>\n    </node>`
        )
        .join('\n')

      return `  <skill_pack id="${escapeXml(s.id)}" name="${escapeXml(
        s.name
      )}">\n    <description>${escapeXml(s.description)}</description>${nodeEntries ? `\n${nodeEntries}` : ''}\n  </skill_pack>`
    })
    .join('\n')

  return [
    '',
    'You have access to the following skill packs. Use list_skill_children, search_skill_tree, load_skill_node, and load_skill_file to progressively load only the relevant content. The legacy load_skill tool is also available for older single-file skills.',
    '',
    '<available_skills>',
    skillEntries,
    '</available_skills>',
  ].join('\n')
}

function buildStringSchema(description: string, enumValues?: string[]) {
  return {
    type: 'string',
    description,
    ...(enumValues && enumValues.length > 0 ? { enum: enumValues } : {}),
  }
}

/**
 * Build the load_skill tool definition for injection into the tools array.
 * Returns a ProviderToolConfig-compatible object so all providers can process it.
 */
export function buildLoadSkillTool(skillNames: string[]) {
  return {
    id: 'load_skill',
    name: 'load_skill',
    description: `Load a skill to get specialized instructions. Available skills: ${skillNames.join(', ')}`,
    params: {},
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'Name of the skill to load',
          enum: skillNames,
        },
      },
      required: ['skill_name'],
    },
  }
}

export function buildHierarchicalSkillTools(skills: SkillMetadata[]) {
  const skillIds = skills.map((skill) => skill.id)

  return [
    {
      id: 'list_skill_children',
      name: 'list_skill_children',
      description: 'List immediate child nodes for a selected skill pack path.',
      params: { _selected_skill_ids: skillIds },
      parameters: {
        type: 'object',
        properties: {
          skill_id: buildStringSchema('Selected skill pack ID', skillIds),
          path: buildStringSchema('Optional folder or node path to list children under.'),
        },
        required: ['skill_id'],
      },
    },
    {
      id: 'search_skill_tree',
      name: 'search_skill_tree',
      description: 'Search selected skill pack metadata and file text for relevant paths.',
      params: { _selected_skill_ids: skillIds },
      parameters: {
        type: 'object',
        properties: {
          skill_id: buildStringSchema('Selected skill pack ID', skillIds),
          query: buildStringSchema('Search query for skill names, paths, or reference content.'),
        },
        required: ['skill_id', 'query'],
      },
    },
    {
      id: 'load_skill_node',
      name: 'load_skill_node',
      description: 'Load one SKILL.md node body and a list of nearby reference files.',
      params: { _selected_skill_ids: skillIds },
      parameters: {
        type: 'object',
        properties: {
          skill_id: buildStringSchema('Selected skill pack ID', skillIds),
          path: buildStringSchema('Exact path of the SKILL.md node to load.'),
        },
        required: ['skill_id', 'path'],
      },
    },
    {
      id: 'load_skill_file',
      name: 'load_skill_file',
      description: 'Load one sidecar reference file from a selected skill pack.',
      params: { _selected_skill_ids: skillIds },
      parameters: {
        type: 'object',
        properties: {
          skill_id: buildStringSchema('Selected skill pack ID', skillIds),
          path: buildStringSchema('Exact path of the reference file to load.'),
        },
        required: ['skill_id', 'path'],
      },
    },
  ]
}

import { createLogger } from '@sim/logger'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'

const logger = createLogger('DefaultUserWorkflowChatDeploy')

export const DEFAULT_CHAT_DEPARTMENT = 'strategy' as const

export const DEFAULT_CHAT_AUTH_TYPE = 'email' as const

export const DEFAULT_CHAT_WELCOME_MESSAGE =
  "How can I help you today? I'm here to answer your questions and assist you with anything you need."

export interface ChatOutputConfigInput {
  blockId?: string
  path: string
  blockName?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses `chat.outputConfigs` from a source workflow entry in the import-deploy body.
 */
export function parseChatOutputConfigInputs(
  rawWorkflow: unknown
): ChatOutputConfigInput[] | { error: string } | undefined {
  if (!isRecord(rawWorkflow)) {
    return undefined
  }

  const chat = rawWorkflow.chat
  if (chat === undefined) {
    return undefined
  }

  if (!isRecord(chat)) {
    return { error: 'chat must be an object when provided.' }
  }

  const rawOutputConfigs = chat.outputConfigs
  if (rawOutputConfigs === undefined) {
    return []
  }

  if (!Array.isArray(rawOutputConfigs)) {
    return { error: 'chat.outputConfigs must be an array.' }
  }

  const parsed: ChatOutputConfigInput[] = []

  for (const [index, rawConfig] of rawOutputConfigs.entries()) {
    if (!isRecord(rawConfig)) {
      return { error: `chat.outputConfigs[${index}] must be an object.` }
    }

    const path = typeof rawConfig.path === 'string' ? rawConfig.path.trim() : ''
    if (!path) {
      return { error: `chat.outputConfigs[${index}].path is required.` }
    }

    const blockId = typeof rawConfig.blockId === 'string' ? rawConfig.blockId.trim() : undefined
    const blockName =
      typeof rawConfig.blockName === 'string' ? rawConfig.blockName.trim() : undefined

    if (!blockId && !blockName) {
      return {
        error: `chat.outputConfigs[${index}] requires blockId or blockName.`,
      }
    }

    parsed.push({
      ...(blockId ? { blockId } : {}),
      ...(blockName ? { blockName } : {}),
      path,
    })
  }

  return parsed
}

/**
 * Resolves admin import output configs against the provisioned workflow's current blocks.
 */
export async function resolveChatOutputConfigs(
  workflowId: string,
  inputs: ChatOutputConfigInput[]
): Promise<Array<{ blockId: string; path: string }>> {
  if (inputs.length === 0) {
    return []
  }

  const normalized = await loadWorkflowFromNormalizedTables(workflowId)
  if (!normalized) {
    throw new Error(`Workflow ${workflowId} has no blocks to resolve chat outputs`)
  }

  const blocks = normalized.blocks
  const blockIdsByName = new Map<string, string[]>()

  for (const [blockId, block] of Object.entries(blocks)) {
    const name = block.name?.trim()
    if (!name) {
      continue
    }
    const key = name.toLowerCase()
    const existing = blockIdsByName.get(key) ?? []
    existing.push(blockId)
    blockIdsByName.set(key, existing)
  }

  const resolved: Array<{ blockId: string; path: string }> = []

  for (const input of inputs) {
    const path = input.path.trim()
    let blockId = input.blockId?.trim()

    if (!blockId && input.blockName) {
      const matches = blockIdsByName.get(input.blockName.trim().toLowerCase()) ?? []
      if (matches.length === 0) {
        throw new Error(`Chat output block not found by name: ${input.blockName}`)
      }
      if (matches.length > 1) {
        throw new Error(
          `Chat output block name "${input.blockName}" is ambiguous (${matches.length} blocks)`
        )
      }
      blockId = matches[0]
    }

    if (!blockId) {
      throw new Error('Chat output config requires blockId or blockName')
    }

    if (!blocks[blockId]) {
      throw new Error(`Chat output block not found: ${blockId}`)
    }

    resolved.push({ blockId, path })
  }

  logger.info('Resolved chat output configs for import-deploy', {
    workflowId,
    count: resolved.length,
  })

  return resolved
}

import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { ToolExecutionContext, ToolExecutionResult } from '@/lib/copilot/tool-executor/types'
import { formatNormalizedWorkflowForCopilot } from '@/lib/copilot/tools/shared/workflow-utils'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { getAllBlocks } from '@/blocks/registry'

const logger = createLogger('P2CopilotNativeTools')

export interface NativeTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  requiresConfirmation?: boolean
  execute: (
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ) => Promise<ToolExecutionResult>
}

/**
 * read_workflow — returns the current workflow's block graph in the same
 * human-readable form the existing copilot uses, so the brain can reason about
 * the canvas without a round-trip to the model's training data.
 */
const readWorkflow: NativeTool = {
  name: 'read_workflow',
  description:
    'Read the current workflow: all blocks, their types, names, configured inputs, and connections. Call this before answering questions about "this workflow" or before editing it.',
  parameters: {
    type: 'object',
    properties: {
      workflowId: {
        type: 'string',
        description: 'Optional workflow ID. Defaults to the workflow in context.',
      },
    },
  },
  async execute(args, context) {
    try {
      const workflowId = (args.workflowId as string | undefined) || context.workflowId
      if (!workflowId) {
        return { success: false, error: 'No workflow in context to read.' }
      }

      const normalized = await loadWorkflowFromNormalizedTables(workflowId)
      if (!normalized) {
        return { success: false, error: `Workflow ${workflowId} not found.` }
      }

      const formatted = formatNormalizedWorkflowForCopilot(
        normalized as Parameters<typeof formatNormalizedWorkflowForCopilot>[0]
      )

      const blockSummary = Object.values(normalized.blocks).map((block) => ({
        id: block.id,
        type: block.type,
        name: block.name,
        enabled: block.enabled,
      }))

      return {
        success: true,
        output: {
          workflowId,
          blockCount: blockSummary.length,
          blocks: blockSummary,
          formatted,
        },
      }
    } catch (error) {
      logger.error('read_workflow failed', { error: toError(error).message })
      return { success: false, error: toError(error).message }
    }
  },
}

/**
 * get_blocks_metadata — returns the catalog of block types the user can add,
 * so the brain knows what is buildable before proposing an edit_workflow op.
 */
const getBlocksMetadata: NativeTool = {
  name: 'get_blocks_metadata',
  description:
    'List the block types available to add to a workflow, with their names, categories, and descriptions. Use this to discover what you can build before calling edit_workflow.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Optional category filter (e.g. "blocks", "tools", "triggers").',
      },
    },
  },
  async execute(args) {
    try {
      const category = args.category as string | undefined
      const blocks = getAllBlocks()
        .filter((block) => !block.hideFromToolbar)
        .filter((block) => (category ? block.category === category : true))
        .map((block) => ({
          type: block.type,
          name: block.name,
          category: block.category,
          description: block.description,
        }))

      return { success: true, output: { count: blocks.length, blocks } }
    } catch (error) {
      logger.error('get_blocks_metadata failed', { error: toError(error).message })
      return { success: false, error: toError(error).message }
    }
  },
}

export const NATIVE_TOOLS: Record<string, NativeTool> = {
  [readWorkflow.name]: readWorkflow,
  [getBlocksMetadata.name]: getBlocksMetadata,
}

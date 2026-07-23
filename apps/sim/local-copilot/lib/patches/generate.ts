import { generateId } from '@sim/utils/id'
import type {
  LocalCopilotStructuredContext,
  WorkflowPatch,
  WorkflowPatchOperation,
} from '@/local-copilot/lib/types'

export interface GeneratePatchParams {
  context: LocalCopilotStructuredContext
  userRequest: string
  targetBlockId?: string
}

/**
 * Generates a heuristic workflow patch from natural language.
 * The LLM can refine via propose_workflow_patch; this provides structured starting points.
 */
export async function generateWorkflowPatchFromRequest(
  params: GeneratePatchParams
): Promise<WorkflowPatch> {
  const { context, userRequest, targetBlockId } = params
  const request = userRequest.toLowerCase()
  const changes: WorkflowPatchOperation[] = []
  const warnings: string[] = []
  const recommendations: string[] = []

  if (request.includes('slack') && request.includes('notification')) {
    const anchorId = targetBlockId ?? findLastNonTriggerBlock(context)
    const slackBlockId = generateId()
    changes.push({
      operation: 'add_block',
      block: {
        id: slackBlockId,
        type: 'slack',
        name: 'Slack Notification',
        position: nextPosition(context, anchorId),
        subBlocks: {},
        outputs: {},
        enabled: true,
      },
    })
    if (anchorId) {
      changes.push({
        operation: 'add_edge',
        edge: {
          id: generateId(),
          source: anchorId,
          target: slackBlockId,
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      })
    } else {
      warnings.push('No anchor block found — connect the new Slack block manually')
    }
    recommendations.push('Configure Slack channel and message content')
  }

  if (request.includes('retry')) {
    recommendations.push('Enable retry on HTTP/API blocks or wrap in error branch')
    warnings.push('Retry handling depends on block type — review block settings')
  }

  if (request.includes('error branch') || request.includes('error handling')) {
    recommendations.push('Add a condition block branching on error output from upstream blocks')
  }

  if (request.includes('every 5 minute') || request.includes('schedule')) {
    const scheduleBlock = context.workflow
      ? Object.values(context.workflow.blocks).find(
          (block) => block.type === 'schedule' || block.type === 'cron'
        )
      : undefined
    if (scheduleBlock) {
      recommendations.push(
        `Update the schedule interval on "${scheduleBlock.name}" in block configuration`
      )
    } else {
      warnings.push('No schedule trigger found — add a Schedule trigger block first')
    }
  }

  if (request.includes('anthropic') && request.includes('openai') && context.workflow) {
    const openAiBlock = Object.values(context.workflow.blocks).find((b) => b.type === 'openai')
    if (openAiBlock) {
      changes.push({
        operation: 'update_block',
        blockId: openAiBlock.id,
        updates: { type: 'anthropic', name: openAiBlock.name.replace(/openai/i, 'Anthropic') },
      })
    }
  }

  if (request.includes('postgres') || request.includes('store')) {
    const anchorId = targetBlockId ?? findLastNonTriggerBlock(context)
    const pgBlockId = generateId()
    changes.push({
      operation: 'add_block',
      block: {
        id: pgBlockId,
        type: 'postgres',
        name: 'Store Result',
        position: nextPosition(context, anchorId),
        subBlocks: {},
        outputs: {},
        enabled: true,
      },
    })
    if (anchorId) {
      changes.push({
        operation: 'add_edge',
        edge: {
          id: generateId(),
          source: anchorId,
          target: pgBlockId,
        },
      })
    }
    recommendations.push('Configure Postgres connection credential and table/column mapping')
  }

  if (changes.length === 0 && request.includes('create')) {
    recommendations.push(
      'Describe triggers, integrations, and data flow — e.g. "webhook → OpenAI → Slack"'
    )
    warnings.push('Could not infer specific blocks — provide more detail for generation')
  }

  return {
    type: 'workflow_patch',
    summary: summarizePatch(userRequest, changes),
    changes,
    requiresConfirmation: true,
    warnings: warnings.length ? warnings : undefined,
    recommendations: recommendations.length ? recommendations : undefined,
  }
}

function findLastNonTriggerBlock(context: LocalCopilotStructuredContext): string | undefined {
  if (!context.workflow) return undefined
  const blocks = Object.values(context.workflow.blocks)
  const nonTriggers = blocks.filter((b) => !b.triggerMode)
  return nonTriggers[nonTriggers.length - 1]?.id
}

function nextPosition(
  context: LocalCopilotStructuredContext,
  anchorId?: string
): { x: number; y: number } {
  if (anchorId && context.workflow?.blocks[anchorId]) {
    const pos = context.workflow.blocks[anchorId].position
    return { x: pos.x + 320, y: pos.y }
  }
  return { x: 100, y: 100 }
}

function summarizePatch(userRequest: string, changes: WorkflowPatchOperation[]): string {
  if (changes.length === 0) return `Review request: ${userRequest.slice(0, 120)}`
  const ops = changes.map((c) => c.operation).join(', ')
  return `Proposed changes (${ops}) for: ${userRequest.slice(0, 100)}`
}

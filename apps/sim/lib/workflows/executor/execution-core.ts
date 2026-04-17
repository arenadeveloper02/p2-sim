/**
 * Core workflow execution logic - shared by all execution paths
 * This is the SINGLE source of truth for workflow execution
 */

import { createLogger } from '@sim/logger'
import type { Edge } from 'reactflow'
import { z } from 'zod'
import { getPersonalAndWorkspaceEnv } from '@/lib/environment/utils'
import { clearExecutionCancellation } from '@/lib/execution/cancellation'
import type { LoggingSession } from '@/lib/logs/execution/logging-session'
import { buildTraceSpans } from '@/lib/logs/execution/trace-spans/trace-spans'
import {
  loadDeployedWorkflowState,
  loadWorkflowFromNormalizedTables,
} from '@/lib/workflows/persistence/utils'
import { mergeSubblockStateWithValues } from '@/lib/workflows/subblocks'
import { TriggerUtils } from '@/lib/workflows/triggers/triggers'
import { updateWorkflowRunCounts } from '@/lib/workflows/utils'
import { Executor } from '@/executor'
import type { ExecutionSnapshot } from '@/executor/execution/snapshot'
import type {
  ChildWorkflowContext,
  ContextExtensions,
  ExecutionCallbacks,
  IterationContext,
  SerializableExecutionState,
} from '@/executor/execution/types'
import type { ExecutionResult, NormalizedBlockOutput } from '@/executor/types'
import { hasExecutionResult } from '@/executor/utils/errors'
import { buildParallelSentinelEndId, buildSentinelEndId } from '@/executor/utils/subflow-utils'
import { Serializer } from '@/serializer'

const logger = createLogger('ExecutionCore')

const EnvVarsSchema = z.record(z.string())

export interface ExecuteWorkflowCoreOptions {
  snapshot: ExecutionSnapshot
  callbacks: ExecutionCallbacks
  loggingSession: LoggingSession
  skipLogCreation?: boolean
  abortSignal?: AbortSignal
  includeFileBase64?: boolean
  base64MaxBytes?: number
  stopAfterBlockId?: string
  /** Run-from-block mode: execute starting from a specific block using cached upstream outputs */
  runFromBlock?: {
    startBlockId: string
    sourceSnapshot: SerializableExecutionState
  }
}

function parseVariableValueByType(value: unknown, type: string): unknown {
  if (value === null || value === undefined) {
    switch (type) {
      case 'number':
        return 0
      case 'boolean':
        return false
      case 'array':
        return []
      case 'object':
        return {}
      default:
        return ''
    }
  }

  if (type === 'number') {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const num = Number(value)
      return Number.isNaN(num) ? 0 : num
    }
    return 0
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }
    return Boolean(value)
  }

  if (type === 'array') {
    if (Array.isArray(value)) return value
    if (typeof value === 'string' && value.trim()) {
      try {
        return JSON.parse(value)
      } catch {
        return []
      }
    }
    return []
  }

  if (type === 'object') {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value
    if (typeof value === 'string' && value.trim()) {
      try {
        return JSON.parse(value)
      } catch {
        return {}
      }
    }
    return {}
  }

  // string or plain
  return typeof value === 'string' ? value : String(value)
}

type ExecutionErrorWithFinalizationFlag = Error & {
  executionFinalizedByCore?: boolean
}

export const FINALIZED_EXECUTION_ID_TTL_MS = 5 * 60 * 1000

const finalizedExecutionIds = new Map<string, number>()

function cleanupExpiredFinalizedExecutionIds(now = Date.now()): void {
  for (const [executionId, expiresAt] of finalizedExecutionIds.entries()) {
    if (expiresAt <= now) {
      finalizedExecutionIds.delete(executionId)
    }
  }
}

function rememberFinalizedExecutionId(executionId: string): void {
  const now = Date.now()

  cleanupExpiredFinalizedExecutionIds(now)
  finalizedExecutionIds.set(executionId, now + FINALIZED_EXECUTION_ID_TTL_MS)
}

async function clearExecutionCancellationSafely(
  executionId: string,
  requestId: string
): Promise<void> {
  try {
    await clearExecutionCancellation(executionId)
  } catch (error) {
    logger.error(`[${requestId}] Failed to clear execution cancellation`, { error, executionId })
  }
}

function markExecutionFinalizedByCore(error: unknown, executionId: string): void {
  rememberFinalizedExecutionId(executionId)

  if (error instanceof Error) {
    ;(error as ExecutionErrorWithFinalizationFlag).executionFinalizedByCore = true
  }
}

export function wasExecutionFinalizedByCore(error: unknown, executionId?: string): boolean {
  cleanupExpiredFinalizedExecutionIds()

  if (executionId && finalizedExecutionIds.has(executionId)) {
    return true
  }

  return (
    error instanceof Error &&
    (error as ExecutionErrorWithFinalizationFlag).executionFinalizedByCore === true
  )
}

async function finalizeExecutionOutcome(params: {
  result: ExecutionResult
  loggingSession: LoggingSession
  executionId: string
  requestId: string
  workflowInput: unknown
  triggerType?: string
}): Promise<void> {
  const { result, loggingSession, executionId, requestId, workflowInput, triggerType } = params
  const { traceSpans, totalDuration } = buildTraceSpans(result)
  const endedAt = new Date().toISOString()

  try {
    try {
      if (result.status === 'cancelled') {
        await loggingSession.safeCompleteWithCancellation({
          endedAt,
          totalDurationMs: totalDuration || 0,
          traceSpans: traceSpans || [],
        })
        return
      }

      if (result.status === 'paused') {
        await loggingSession.safeCompleteWithPause({
          endedAt,
          totalDurationMs: totalDuration || 0,
          traceSpans: traceSpans || [],
          workflowInput,
        })
        return
      }

      if (result.status === 'skipped') {
        const skipOutput = result.output && typeof result.output === 'object' ? result.output : {}
        const skipContent =
          'content' in skipOutput && typeof skipOutput.content === 'string'
            ? skipOutput.content
            : undefined

        if (!skipContent) {
          logger.warn(`[${requestId}] Skip response content missing for skipped execution`, {
            executionId,
            hasOutput: !!result.output,
          })
        }

        await loggingSession.safeCompleteAsSkipped({
          endedAt,
          totalDurationMs: totalDuration || 0,
          finalOutput: skipOutput,
          traceSpans: traceSpans || [],
          workflowInput,
          finalChatOutput: skipContent,
        })
        return
      }

      let finalChatOutput: string | undefined
      if (triggerType === 'chat' && result.success) {
        const output = result.output
        if (typeof output === 'string') {
          finalChatOutput = output
        } else if (output !== undefined && output !== null) {
          if (
            typeof output === 'object' &&
            'content' in output &&
            typeof output.content === 'string'
          ) {
            finalChatOutput = output.content
          } else {
            finalChatOutput = JSON.stringify(output)
          }
        }
      }

      await loggingSession.safeComplete({
        endedAt,
        totalDurationMs: totalDuration || 0,
        finalOutput: result.output || {},
        traceSpans: traceSpans || [],
        workflowInput,
        finalChatOutput,
        executionState: result.executionState,
      })
    } catch (error) {
      logger.warn(`[${requestId}] Post-execution finalization failed`, {
        executionId,
        status: result.status,
        error,
      })
    }
  } finally {
    await clearExecutionCancellationSafely(executionId, requestId)
  }
}

async function finalizeExecutionError(params: {
  error: unknown
  loggingSession: LoggingSession
  executionId: string
  requestId: string
}): Promise<boolean> {
  const { error, loggingSession, executionId, requestId } = params
  const executionResult = hasExecutionResult(error) ? error.executionResult : undefined
  const { traceSpans } = executionResult ? buildTraceSpans(executionResult) : { traceSpans: [] }

  try {
    await loggingSession.safeCompleteWithError({
      endedAt: new Date().toISOString(),
      totalDurationMs: executionResult?.metadata?.duration || 0,
      error: {
        message: error instanceof Error ? error.message : 'Execution failed',
        stackTrace: error instanceof Error ? error.stack : undefined,
      },
      traceSpans,
    })

    return loggingSession.hasCompleted()
  } catch (postExecError) {
    logger.error(`[${requestId}] Post-execution error logging failed`, {
      error: postExecError,
    })
    return false
  } finally {
    await clearExecutionCancellationSafely(executionId, requestId)
  }
}

export async function executeWorkflowCore(
  options: ExecuteWorkflowCoreOptions
): Promise<ExecutionResult> {
  const {
    snapshot,
    callbacks,
    loggingSession,
    skipLogCreation,
    abortSignal,
    includeFileBase64,
    base64MaxBytes,
    stopAfterBlockId,
    runFromBlock,
  } = options
  const { metadata, workflow, input, workflowVariables, selectedOutputs } = snapshot
  const { requestId, workflowId, userId, triggerType, executionId, triggerBlockId, useDraftState } =
    metadata
  const { onBlockStart, onBlockComplete, onStream, onChildWorkflowInstanceReady } = callbacks

  const providedWorkspaceId = metadata.workspaceId
  if (!providedWorkspaceId) {
    throw new Error(`Execution metadata missing workspaceId for workflow ${workflowId}`)
  }

  let processedInput = input || {}
  let deploymentVersionId: string | undefined
  let loggingStarted = false

  try {
    let blocks
    let edges: Edge[]
    let loops
    let parallels

    // Use workflowStateOverride if provided (for diff workflows)
    if (metadata.workflowStateOverride) {
      blocks = metadata.workflowStateOverride.blocks
      edges = metadata.workflowStateOverride.edges
      loops = metadata.workflowStateOverride.loops || {}
      parallels = metadata.workflowStateOverride.parallels || {}
      deploymentVersionId = metadata.workflowStateOverride.deploymentVersionId

      logger.info(`[${requestId}] Using workflow state override (diff workflow execution)`, {
        blocksCount: Object.keys(blocks).length,
        edgesCount: edges.length,
      })
    } else if (useDraftState) {
      const draftData = await loadWorkflowFromNormalizedTables(workflowId)

      if (!draftData) {
        throw new Error('Workflow not found or not yet saved')
      }

      blocks = draftData.blocks
      edges = draftData.edges
      loops = draftData.loops
      parallels = draftData.parallels

      logger.info(
        `[${requestId}] Using draft workflow state from normalized tables (client execution)`
      )
    } else {
      const deployedData = await loadDeployedWorkflowState(workflowId)
      blocks = deployedData.blocks
      edges = deployedData.edges
      loops = deployedData.loops
      parallels = deployedData.parallels
      deploymentVersionId = deployedData.deploymentVersionId

      logger.info(`[${requestId}] Using deployed workflow state (deployed execution)`)
    }

    const mergedStates = mergeSubblockStateWithValues(blocks)

    const personalEnvUserId =
      metadata.isClientSession && metadata.sessionUserId
        ? metadata.sessionUserId
        : metadata.workflowUserId

    if (!personalEnvUserId) {
      throw new Error('Missing workflowUserId in execution metadata')
    }

    const { personalEncrypted, workspaceEncrypted, personalDecrypted, workspaceDecrypted } =
      await getPersonalAndWorkspaceEnv(personalEnvUserId, providedWorkspaceId)

    // For scheduler/webhook executions, prioritize server environment variables
    const isScheduledOrWebhook =
      metadata.triggerType === 'schedule' || metadata.triggerType === 'webhook'
    const serverEnvVars: Record<string, string> = {}

    if (isScheduledOrWebhook) {
      const { env } = await import('@/lib/core/config/env')
      const serverEnvVarNames = [
        'OPENAI_API_KEY',
        'OPENAI_API_KEY_1',
        'OPENAI_API_KEY_2',
        'OPENAI_API_KEY_3',
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_API_KEY_1',
        'ANTHROPIC_API_KEY_2',
        'ANTHROPIC_API_KEY_3',
        'GEMINI_API_KEY',
        'SAMBANOVA_API_KEY',
        'SAMBANOVA_API_KEY_1',
        'SAMBANOVA_API_KEY_2',
        'SAMBANOVA_API_KEY_3',
        'XAI_API_KEY',
        'XAI_API_KEY_1',
        'XAI_API_KEY_2',
        'XAI_API_KEY_3',
        'AZURE_OPENAI_API_KEY',
        'SEMRUSH_API_KEY',
        'BROWSERBASE_API_KEY',
        'PRESENTATION_API_BASE_URL',
        'EXA_API_KEY',
        'COPILOT_API_KEY',
        'S3_PROFILE_PICTURES_BUCKET_NAME',
        'S3_COPILOT_BUCKET_NAME',
        'S3_CHAT_BUCKET_NAME',
        'S3_EXECUTION_FILES_BUCKET_NAME',
        'S3_KB_BUCKET_NAME',
        'S3_LOGS_BUCKET_NAME',
        'NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS',
        'CRON_SECRET',
        'FB_CLIENT_SECRET',
        'FB_CLIENT_ID',
        'FB_ACCESS_TOKEN',
        'FROM_EMAIL_ADDRESS',
        'NEXT_PUBLIC_FIRECRAWL_API_KEY',
        'FIRECRAWL_API_KEY',
        'BROWSER_USE_API_KEY',
        'SPYFU_API_PASSWORD',
        'SPYFU_API_USERNAME',
        'CHROMEDRIVER_PATH',
        'FIGMA_API_KEY',
        'GOOGLE_ADS_REFRESH_TOKEN',
        'GOOGLE_ADS_CLIENT_SECRET',
        'GOOGLE_ADS_CLIENT_ID',
        'GOOGLE_ADS_DEVELOPER_TOKEN',
        'S3_COPILOT_BUCKET_NAME',
        'INTERNAL_API_SECRET',
        'S3_KB_BUCKET_NAME',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_ACCESS_KEY_ID',
        'AWS_REGION',
        'S3_BUCKET_NAME',
        'SLACK_CLIENT_ID',
        'SLACK_CLIENT_SECRET',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_CLIENT_ID',
      ]

      for (const varName of serverEnvVarNames) {
        const value = env[varName as keyof typeof env]
        if (value && typeof value === 'string') {
          serverEnvVars[varName] = value
        }
      }
    }

    // Merge: Server env vars take priority, then workspace, then personal
    // Use encrypted values for logging (don't log decrypted secrets)
    const variables = EnvVarsSchema.parse({
      ...personalEncrypted,
      ...workspaceEncrypted,
      ...serverEnvVars, // Server vars override user/workspace vars
    })

    // Use already-decrypted values for execution (no redundant decryption)
    // Server env vars override user/workspace vars
    const decryptedEnvVars: Record<string, string> = {
      ...personalDecrypted,
      ...workspaceDecrypted,
      ...serverEnvVars, // Server vars override user/workspace vars
    }

    // Extract conversationId from input if available (for chat workflows)
    const conversationId =
      typeof input === 'object' && input !== null && 'conversationId' in input
        ? input.conversationId
        : undefined

    // Extract initial input for chat workflows
    // Include startBlockInputs (custom fields from inputFormat) in the format:
    // variable1: Value entered by User\nvariable2: value entered by User
    let initialInput: string | undefined
    if (triggerType === 'chat' && typeof input === 'object' && input !== null) {
      const baseInput = 'input' in input ? (input.input as string | undefined) : undefined
      const startBlockInputLines: string[] = []

      // Extract custom fields (excluding reserved fields)
      for (const [key, value] of Object.entries(input)) {
        if (key === 'input' || key === 'conversationId' || key === 'files') {
          continue
        }
        if (value !== null && value !== undefined && value !== '') {
          const formattedValue = typeof value === 'string' ? value : String(value)
          startBlockInputLines.push(`${key}: ${formattedValue}`)
        }
      }

      if (startBlockInputLines.length > 0) {
        const startBlockInputsFormatted = startBlockInputLines.join('\n')
        initialInput = baseInput
          ? `${baseInput}\n${startBlockInputsFormatted}`
          : startBlockInputsFormatted
      } else {
        initialInput = baseInput
      }
    }

    loggingStarted = await loggingSession.safeStart({
      userId,
      workspaceId: providedWorkspaceId,
      variables,
      triggerData: metadata.correlation ? { correlation: metadata.correlation } : undefined,
      skipLogCreation,
      deploymentVersionId,
      conversationId,
      initialInput,
    })

    // Use edges directly - trigger-to-trigger edges are prevented at creation time
    const filteredEdges = edges

    // Check if this is a resume execution before trigger resolution
    const resumeFromSnapshot = metadata.resumeFromSnapshot === true
    const resumePendingQueue = snapshot.state?.pendingQueue

    let resolvedTriggerBlockId = triggerBlockId

    // For resume executions, skip trigger resolution since we have a pending queue
    if (resumeFromSnapshot && resumePendingQueue?.length) {
      resolvedTriggerBlockId = undefined
      logger.info(`[${requestId}] Skipping trigger resolution for resume execution`, {
        pendingQueueLength: resumePendingQueue.length,
      })
    } else if (!triggerBlockId) {
      const executionKind =
        triggerType === 'api' || triggerType === 'chat'
          ? (triggerType as 'api' | 'chat')
          : triggerType === 'webhook' || triggerType === 'schedule'
            ? 'external'
            : 'manual'

      const startBlock = TriggerUtils.findStartBlock(mergedStates, executionKind, false)

      if (!startBlock) {
        const errorMsg = 'No start block found. Add a start block to this workflow.'
        logger.error(`[${requestId}] ${errorMsg}`)
        throw new Error(errorMsg)
      }

      resolvedTriggerBlockId = startBlock.blockId
      logger.info(`[${requestId}] Identified trigger block for ${executionKind} execution:`, {
        blockId: resolvedTriggerBlockId,
        blockType: startBlock.block.type,
        path: startBlock.path,
      })
    }

    // Serialize workflow
    const serializedWorkflow = new Serializer().serializeWorkflow(
      mergedStates,
      filteredEdges,
      loops,
      parallels,
      true
    )

    processedInput = input || {}

    // Resolve stopAfterBlockId for loop/parallel containers to their sentinel-end IDs
    let resolvedStopAfterBlockId = stopAfterBlockId
    if (stopAfterBlockId) {
      if (serializedWorkflow.loops?.[stopAfterBlockId]) {
        resolvedStopAfterBlockId = buildSentinelEndId(stopAfterBlockId)
      } else if (serializedWorkflow.parallels?.[stopAfterBlockId]) {
        resolvedStopAfterBlockId = buildParallelSentinelEndId(stopAfterBlockId)
      }
    }

    // Create and execute workflow with callbacks
    if (resumeFromSnapshot) {
      logger.info(`[${requestId}] Resume execution detected`, {
        resumePendingQueue,
        hasState: !!snapshot.state,
        stateBlockStatesCount: snapshot.state
          ? Object.keys(snapshot.state.blockStates || {}).length
          : 0,
        executedBlocksCount: snapshot.state?.executedBlocks?.length ?? 0,
        useDraftState,
      })
    }

    const wrappedOnBlockComplete = async (
      blockId: string,
      blockName: string,
      blockType: string,
      output: {
        input?: unknown
        output: NormalizedBlockOutput
        executionTime: number
        startedAt: string
        endedAt: string
      },
      iterationContext?: IterationContext,
      childWorkflowContext?: ChildWorkflowContext
    ) => {
      try {
        await loggingSession.onBlockComplete(blockId, blockName, blockType, output)
        if (onBlockComplete) {
          void onBlockComplete(
            blockId,
            blockName,
            blockType,
            output,
            iterationContext,
            childWorkflowContext
          ).catch((error) => {
            logger.warn(`[${requestId}] Block completion callback failed`, {
              executionId,
              blockId,
              blockType,
              error,
            })
          })
        }
      } catch (error) {
        logger.warn(`[${requestId}] Block completion persistence failed`, {
          executionId,
          blockId,
          blockType,
          error,
        })
      }
    }

    const wrappedOnBlockStart = async (
      blockId: string,
      blockName: string,
      blockType: string,
      executionOrder: number,
      iterationContext?: IterationContext,
      childWorkflowContext?: ChildWorkflowContext
    ) => {
      try {
        await loggingSession.onBlockStart(blockId, blockName, blockType, new Date().toISOString())
        if (onBlockStart) {
          void onBlockStart(
            blockId,
            blockName,
            blockType,
            executionOrder,
            iterationContext,
            childWorkflowContext
          ).catch((error) => {
            logger.warn(`[${requestId}] Block start callback failed`, {
              executionId,
              blockId,
              blockType,
              error,
            })
          })
        }
      } catch (error) {
        logger.warn(`[${requestId}] Block start persistence failed`, {
          executionId,
          blockId,
          blockType,
          error,
        })
      }
    }

    const contextExtensions: ContextExtensions = {
      stream: !!onStream,
      selectedOutputs,
      executionId,
      workspaceId: providedWorkspaceId,
      userId,
      isDeployedContext: !metadata.isClientSession,
      enforceCredentialAccess: metadata.enforceCredentialAccess ?? false,
      onBlockStart: wrappedOnBlockStart,
      onBlockComplete: wrappedOnBlockComplete,
      onStream,
      resumeFromSnapshot,
      resumePendingQueue,
      remainingEdges: snapshot.state?.remainingEdges?.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      })),
      dagIncomingEdges: snapshot.state?.dagIncomingEdges,
      snapshotState: snapshot.state,
      metadata,
      abortSignal,
      includeFileBase64,
      base64MaxBytes,
      stopAfterBlockId: resolvedStopAfterBlockId,
      onChildWorkflowInstanceReady,
      callChain: metadata.callChain,
    }

    const executorInstance = new Executor({
      workflow: serializedWorkflow,
      envVarValues: decryptedEnvVars,
      workflowInput: processedInput,
      workflowVariables,
      contextExtensions,
    })

    // Convert initial workflow variables to their native types
    if (workflowVariables) {
      for (const [varId, variable] of Object.entries(workflowVariables)) {
        const v = variable as { value?: unknown; type?: string }
        if (v.value !== undefined && v.type) {
          v.value = parseVariableValueByType(v.value, v.type)
        }
      }
    }

    const result = runFromBlock
      ? ((await executorInstance.executeFromBlock(
          workflowId,
          runFromBlock.startBlockId,
          runFromBlock.sourceSnapshot
        )) as ExecutionResult)
      : ((await executorInstance.execute(workflowId, resolvedTriggerBlockId)) as ExecutionResult)

    loggingSession.setPostExecutionPromise(
      (async () => {
        try {
          await finalizeExecutionOutcome({
            result,
            loggingSession,
            executionId,
            requestId,
            workflowInput: processedInput,
            triggerType,
          })

          if (result.success && result.status !== 'paused' && result.status !== 'skipped') {
            try {
              await updateWorkflowRunCounts(workflowId)
            } catch (runCountError) {
              logger.error(`[${requestId}] Failed to update run counts`, { error: runCountError })
            }
          }
        } catch (postExecError) {
          logger.error(`[${requestId}] Post-execution logging failed`, { error: postExecError })
        }
      })()
    )

    logger.info(`[${requestId}] Workflow execution completed`, {
      success: result.success,
      status: result.status,
      duration: result.metadata?.duration,
    })

    return result
  } catch (error: unknown) {
    logger.error(`[${requestId}] Execution failed:`, error)

    if (!loggingStarted) {
      loggingStarted = await loggingSession.safeStart({
        userId,
        workspaceId: providedWorkspaceId,
        variables: {},
        triggerData: metadata.correlation ? { correlation: metadata.correlation } : undefined,
        skipLogCreation,
        deploymentVersionId,
      })
    }

    loggingSession.setPostExecutionPromise(
      (async () => {
        try {
          const finalized = loggingStarted
            ? await finalizeExecutionError({
                error,
                loggingSession,
                executionId,
                requestId,
              })
            : false

          if (finalized) {
            markExecutionFinalizedByCore(error, executionId)
          }
        } catch (postExecError) {
          logger.error(`[${requestId}] Post-execution error logging failed`, {
            error: postExecError,
          })
        }
      })()
    )

    throw error
  }
}

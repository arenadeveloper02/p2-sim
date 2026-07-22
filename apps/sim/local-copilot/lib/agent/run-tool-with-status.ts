import { sleep } from '@sim/utils/helpers'
import {
  engagementContextFromTool,
  generateEngagementStatusMessages,
} from '@/local-copilot/lib/agent/engagement-status'
import {
  buildToolHeartbeatStatus,
  buildToolStartStatus,
  truncateStatusMessage,
} from '@/local-copilot/lib/agent/status-messages'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'
import type { ToolExecutionResult } from '@/local-copilot/lib/tools/executor'

const TOOL_HEARTBEAT_MS = 4000
const POLL_MS = 100

/**
 * Runs a tool while yielding immediate + heartbeat + onProgress status events.
 * After start copy, optionally swaps heartbeat rotation to a cheap-model batch.
 * Does not yield `tool_call_start` / `tool_call_result` — the orchestrator owns those.
 */
export async function* runToolWithStatus(params: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  abortSignal?: AbortSignal
  execute: (onProgress: (message: string) => void) => Promise<ToolExecutionResult>
}): AsyncGenerator<LocalCopilotStreamEvent, ToolExecutionResult, undefined> {
  const { toolCallId, toolName, args, abortSignal, execute } = params
  const startMessage = buildToolStartStatus(toolName, args)
  yield { type: 'status', message: startMessage, toolCallId, toolName }

  let lastMessage = startMessage
  let lastProgressAt = Date.now()
  const progressQueue: string[] = []

  let engagementMessages: string[] | null = null
  let engagementIndex = 0
  const enrichController = new AbortController()
  const onParentAbort = () => enrichController.abort()
  abortSignal?.addEventListener('abort', onParentAbort, { once: true })
  const enrichPromise = generateEngagementStatusMessages(
    engagementContextFromTool(toolName, args, enrichController.signal)
  )
    .then((messages) => {
      if (messages && messages.length > 0) {
        engagementMessages = [...messages]
      }
    })
    .catch(() => undefined)

  const onProgress = (message: string) => {
    const next = truncateStatusMessage(message)
    if (!next.trim()) return
    progressQueue.push(next)
    lastMessage = next
    lastProgressAt = Date.now()
  }

  let settled = false
  let result: ToolExecutionResult | undefined
  let failure: unknown
  const toolPromise = execute(onProgress).then(
    (value) => {
      settled = true
      result = value
    },
    (error: unknown) => {
      settled = true
      failure = error
    }
  )

  try {
    while (!settled) {
      if (abortSignal?.aborted) break
      await sleep(POLL_MS)
      while (progressQueue.length > 0) {
        const message = progressQueue.shift()
        if (!message) continue
        yield { type: 'status', message, toolCallId, toolName }
      }
      if (!settled && Date.now() - lastProgressAt >= TOOL_HEARTBEAT_MS) {
        const heartbeat =
          engagementMessages && engagementMessages.length > 0
            ? engagementMessages[engagementIndex % engagementMessages.length]!
            : buildToolHeartbeatStatus(lastMessage, toolName, args)
        engagementIndex += 1
        lastMessage = heartbeat
        lastProgressAt = Date.now()
        yield { type: 'status', message: heartbeat, toolCallId, toolName }
      }
    }

    await toolPromise
    if (failure !== undefined) throw failure
    if (!result) {
      throw new Error(`Tool ${toolName} settled without a result`)
    }
    return result
  } finally {
    enrichController.abort()
    abortSignal?.removeEventListener('abort', onParentAbort)
    await enrichPromise
  }
}

import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { buildLocalCopilotContext, contextToPromptJson } from '@/local-copilot/lib/context/build-context'
import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import {
  appendMessage,
  createConversation,
  getMessages,
  recordToolCall,
  savePatch,
} from '@/local-copilot/lib/persistence/store'
import { getLocalCopilotProvider } from '@/local-copilot/lib/providers/registry'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import { LOCAL_COPILOT_TOOLS } from '@/local-copilot/lib/tools/definitions'
import {
  executeLocalCopilotTool,
  refreshToolContext,
} from '@/local-copilot/lib/tools/executor'
import {
  formatToolResultForLlm,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'
import type { LocalCopilotStreamEvent, WorkflowPatch } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotAgent')

const SYSTEM_PROMPT = `You are Arena AI Copilot — an in-app AI assistant for building, debugging, and understanding Sim.ai workflows.

Rules:
- You have awareness of the workspace, available blocks/integrations, and (when open) the current workflow structure, variables, logs, and credential metadata (never secrets).
- On the workspace home chat there may be no workflow open — use create_workflow then edit_workflow to build new workflows (same as Mothership copilot).
- After create_workflow succeeds, immediately call edit_workflow with add operations to populate the workflow. Use the returned workflowId.
- When edit_workflow returns skippedItems, inputValidationErrors, workflowLintMessage, or needsFollowUpEdit, call edit_workflow again with corrected operations. Do not tell the user the workflow is complete until these are resolved.
- deferredConnections in edit_workflow results are normal — the engine wires them when target blocks exist. Do not re-issue deferred edges unless the target id was a typo.
- Never expose API keys, tokens, passwords, or secret env values.
- For open workflows, propose incremental changes via workflow patches (requiresConfirmation). For new workflows from home chat, use create_workflow + edit_workflow.
- Use tools to inspect context, validate workflows, fetch logs, and build or edit workflows.
- When debugging failures, identify root cause, failing block, suggested fix, and test steps.
- Be concise and actionable.`

export interface RunAgentParams {
  userId: string
  workspaceId: string
  workflowId?: string
  message: string
  conversationId?: string
  chatId?: string
  selectedBlockId?: string
  executionId?: string
  signal?: AbortSignal
}

export async function* runLocalCopilotAgent(
  params: RunAgentParams
): AsyncGenerator<LocalCopilotStreamEvent, void, undefined> {
  const config = getLocalCopilotConfig()
  const structuredContext = await buildLocalCopilotContext({
    userId: params.userId,
    workspaceId: params.workspaceId,
    ...(params.workflowId ? { workflowId: params.workflowId } : {}),
    selectedBlockId: params.selectedBlockId,
    executionId: params.executionId,
  })

  let conversationId = params.conversationId
  if (!conversationId) {
    conversationId = await createConversation({
      userId: params.userId,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      model: config.model,
      provider: config.provider,
    })
  }

  await appendMessage({
    conversationId,
    role: 'user',
    content: { text: params.message },
  })

  await logCopilotAction({
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId,
    conversationId,
    action: 'chat_message',
    summary: params.message.slice(0, 200),
  })

  const history = await getMessages(conversationId)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Current context:\n${contextToPromptJson(structuredContext)}`,
    },
  ]

  for (const row of history.slice(0, -1)) {
    const content = row.content as { text?: string }
    if (content.text) {
      messages.push({ role: row.role as 'user' | 'assistant', content: content.text })
    }
  }
  messages.push({ role: 'user', content: params.message })

  const provider = getLocalCopilotProvider()
  const toolCtx = {
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId,
    chatId: params.chatId,
    abortSignal: params.signal,
    structuredContext,
    selectedBlockId: params.selectedBlockId,
  }
  let assistantText = ''
  let proposedPatch: WorkflowPatch | undefined
  let recommendations: string[] = []
  const maxToolRounds = MAX_TOOL_ITERATIONS

  for (let round = 0; round < maxToolRounds; round++) {
    const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

    for await (const chunk of provider.chatCompletionStream({
      model: config.model,
      messages,
      tools: LOCAL_COPILOT_TOOLS,
      signal: params.signal,
    })) {
      if (chunk.type === 'text' && chunk.content) {
        assistantText += chunk.content
        yield { type: 'text_delta', content: chunk.content }
      }
      if (chunk.type === 'tool_call' && chunk.toolCall) {
        pendingToolCalls.push(chunk.toolCall)
      }
    }

    if (pendingToolCalls.length === 0) break

    const orderedToolCalls = sortToolCallsForExecution(pendingToolCalls)

    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: orderedToolCalls,
    })
    assistantText = ''

    for (const call of orderedToolCalls) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(call.arguments || '{}') as Record<string, unknown>
      } catch {
        parsedArgs = {}
      }

      yield {
        type: 'tool_call_start',
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
      }

      const result = await executeLocalCopilotTool(call.name, parsedArgs, toolCtx)

      if (result.createdWorkflowId) {
        toolCtx.workflowId = result.createdWorkflowId
        const refreshed = await refreshToolContext(toolCtx)
        toolCtx.structuredContext = refreshed.structuredContext
      } else if (call.name === 'edit_workflow' && result.success) {
        const refreshed = await refreshToolContext(toolCtx)
        toolCtx.structuredContext = refreshed.structuredContext
      }

      yield {
        type: 'tool_call_result',
        toolCallId: call.id,
        toolName: call.name,
        success: result.success,
        output: result.result,
        ...(result.error ? { error: result.error } : {}),
      }

      await recordToolCall({
        conversationId,
        toolCallId: call.id,
        toolName: call.name,
        arguments: parsedArgs,
        result: result.result,
      })

      if (result.patch) {
        proposedPatch = result.patch
        if (result.patch.recommendations) {
          recommendations = [...recommendations, ...result.patch.recommendations]
        }
      }

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: formatToolResultForLlm(call.name, result.result),
      })
    }
  }

  if (recommendations.length) {
    yield { type: 'recommendations', items: [...new Set(recommendations)] }
  }

  let patchId: string | undefined
  if (proposedPatch && params.workflowId) {
    patchId = await savePatch({
      conversationId,
      userId: params.userId,
      workflowId: params.workflowId,
      patch: proposedPatch,
    })
    yield { type: 'patch_proposed', patch: proposedPatch, patchId }
  } else if (proposedPatch) {
    yield {
      type: 'text_delta',
      content:
        '\n\n*(Workflow patch proposed — open a workflow in the editor to review and apply changes.)*',
    }
  }

  const messageId = await appendMessage({
    conversationId,
    role: 'assistant',
    content: {
      text: assistantText,
      patchId,
      recommendations: recommendations.length ? recommendations : undefined,
    },
  })

  logger.info('Arena Copilot turn complete', { conversationId, messageId, patchId })
  yield { type: 'done', messageId }
}

export function formatSSE(event: LocalCopilotStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

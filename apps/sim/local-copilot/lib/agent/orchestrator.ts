import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { buildLocalCopilotContext, contextToPromptJson } from '@/local-copilot/lib/context/build-context'
import {
  compactChatHistory,
  estimateChatMessagesTokens,
  fitPromptToTokenBudget,
  LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
  resolveWorkflowContextDetail,
} from '@/local-copilot/lib/context/context-budget'
import { formatOptionsTag } from '@/local-copilot/lib/format-options-tag'
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
import { isWorkflowScopedDelegatedTool } from '@/local-copilot/lib/tools/mothership-delegated-tools'
import {
  formatToolResultForLlm,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'
import type { LocalCopilotStreamEvent, WorkflowPatch } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotAgent')

const SYSTEM_PROMPT = `You are Arena Copilot — the in-app AI assistant for building, debugging, and understanding workflows in this workspace.

Identity:
- Your name is Arena Copilot. When speaking to the user, always refer to yourself as "Arena Copilot".
- Never call yourself Sim AI Copilot, Sim Copilot, Sim.ai Copilot, Mothership, or any other name.

Response format:
- Open with a warm, concise greeting when starting a conversation or after a long pause.
- Briefly summarize what you see in the workspace (workflows, files, tables, knowledge bases) in plain prose. Do not greet with a generic capability bullet list.
- When suggesting next steps, end your message with a clickable options block in this exact format (never use markdown bullet lists for suggestions):

<options>{"1":{"title":"Run the Weekly Email Summary","description":"Execute this workflow and summarize the results"},"2":{"title":"Build a new workflow","description":"Create a new automation from scratch"}}</options>

- Each option title is sent as the user's next message when they click it — write titles as clear imperative commands (e.g. "Check my inbox", "Debug the last run").
- Include 3–4 options when offering follow-ups. Omit the options block when no follow-ups are needed.

Rules:
- You have awareness of the workspace, available blocks/integrations, and (when open) the current workflow structure, variables, logs, and credential metadata (never secrets).
- On the workspace home chat there may be no workflow open — use create_workflow then edit_workflow to build new workflows.
- After create_workflow succeeds, immediately call edit_workflow with add operations to populate the workflow. Use the returned workflowId.
- When edit_workflow returns skippedItems, inputValidationErrors, workflowLintMessage, or needsFollowUpEdit, call edit_workflow again with corrected operations. Do not tell the user the workflow is complete until these are resolved.
- deferredConnections in edit_workflow results are normal — the engine wires them when target blocks exist. Do not re-issue deferred edges unless the target id was a typo.
- Never expose API keys, tokens, passwords, or secret env values.
- Credentials and API keys:
  - Context includes \`connectedIntegrations\` (OAuth) and \`envVariables\` (configured env key names only). If an integration or its env key (e.g. \`FIRECRAWL_API_KEY\`, \`FALAI_API_KEY\`) appears there, credentials are already available — NEVER ask the user for an API key.
  - When \`hostedKeysAvailable\` is true, many api_key blocks also receive platform-hosted keys at runtime — do not prompt for keys unless a tool returns an explicit missing-credential error.
  - For OAuth blocks, pass the \`credentialId\` from \`connectedIntegrations\`. For api_key blocks backed by env vars, omit api-key subblock values — execution reads workspace env automatically.
  - Only ask the user to configure a key when it is missing from both \`connectedIntegrations\` and \`envVariables\` and hosted keys do not apply.
- For open workflows, propose incremental changes via workflow patches (requiresConfirmation). For new workflows from home chat, use create_workflow + edit_workflow.
- Running and testing workflows:
  - On home chat there is no open workflow — always pass \`workflowId\` from \`workspaceWorkflows\` (or the workflow name; it will be resolved automatically when unambiguous).
  - Use \`get_workflow_run_options\` first to discover triggers, required \`workflow_input\`, and mock payloads.
  - Use \`run_workflow\` to execute a workflow and inspect block outputs. Pass \`workflowId\` from \`workspaceWorkflows\` on home chat, or omit it when a workflow is already open.
  - After a run, summarize key block outputs for the user in plain language. Use \`query_logs\` with the returned \`executionId\` for deeper debugging.
  - Use \`list_integration_tools\` to see operations available for a connected integration service.
  - Use \`get_workflow_data\` to load workflow structure when you need details for a workflow that is not currently open.
- Use tools to inspect context, validate workflows, fetch logs, run tests, and build or edit workflows.
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
  /** Prior turns from mothership chat (`copilot_messages`). */
  priorMessages?: ChatMessage[]
  /** When false, skip `local_copilot_*` persistence (mothership chat owns the transcript). */
  persistLocally?: boolean
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

  const persistLocally = params.persistLocally !== false

  let conversationId = params.conversationId
  if (persistLocally) {
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
  }

  const historyMessages: ChatMessage[] = params.priorMessages?.length
    ? compactChatHistory(params.priorMessages)
    : conversationId
      ? compactChatHistory(
          (await getMessages(conversationId)).slice(0, -1).flatMap((row) => {
            const content = row.content as { text?: string }
            if (!content.text) return []
            return [{ role: row.role as 'user' | 'assistant', content: content.text }]
          })
        )
      : []

  const workflowDetail = resolveWorkflowContextDetail(structuredContext)
  const contextJson = contextToPromptJson(structuredContext, { workflowDetail })

  const messages: ChatMessage[] = fitPromptToTokenBudget(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Current context:\n${contextJson}`,
      },
      ...historyMessages,
      { role: 'user', content: params.message },
    ],
    LOCAL_COPILOT_PROMPT_TOKEN_BUDGET
  )

  logger.info('Arena Copilot prompt budget applied', {
    workflowDetail,
    historyTurns: historyMessages.length,
    estimatedPromptTokens: estimateChatMessagesTokens(messages),
  })

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
      } else if (result.success && isWorkflowScopedDelegatedTool(call.name)) {
        const output =
          result.result && typeof result.result === 'object'
            ? (result.result as Record<string, unknown>)
            : {}
        const resolvedWorkflowId =
          typeof output.workflowId === 'string' && output.workflowId.trim()
            ? output.workflowId.trim()
            : typeof parsedArgs.workflowId === 'string' && parsedArgs.workflowId.trim()
              ? parsedArgs.workflowId.trim()
              : undefined
        if (resolvedWorkflowId) {
          toolCtx.workflowId = resolvedWorkflowId
        }
      }

      yield {
        type: 'tool_call_result',
        toolCallId: call.id,
        toolName: call.name,
        success: result.success,
        output: result.result,
        ...(result.error ? { error: result.error } : {}),
      }

      if (persistLocally && conversationId) {
        await recordToolCall({
          conversationId,
          toolCallId: call.id,
          toolName: call.name,
          arguments: parsedArgs,
          result: result.result,
        })
      }

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
    const optionsTag = formatOptionsTag(recommendations)
    assistantText += optionsTag
    yield { type: 'text_delta', content: optionsTag }
  }

  let patchId: string | undefined
  if (proposedPatch && params.workflowId) {
    if (persistLocally && conversationId) {
      patchId = await savePatch({
        conversationId,
        userId: params.userId,
        workflowId: params.workflowId,
        patch: proposedPatch,
      })
    }
    yield { type: 'patch_proposed', patch: proposedPatch, patchId: patchId ?? '' }
  } else if (proposedPatch) {
    yield {
      type: 'text_delta',
      content:
        '\n\n*(Workflow patch proposed — open a workflow in the editor to review and apply changes.)*',
    }
  }

  let messageId = ''
  if (persistLocally && conversationId) {
    messageId = await appendMessage({
      conversationId,
      role: 'assistant',
      content: {
        text: assistantText,
        patchId,
        recommendations: recommendations.length ? recommendations : undefined,
      },
    })
  }

  logger.info('Arena Copilot turn complete', {
    conversationId: conversationId ?? null,
    messageId: messageId || null,
    patchId: patchId ?? null,
    historyTurns: historyMessages.length,
  })
  yield { type: 'done', messageId: messageId || generateId() }
}

export function formatSSE(event: LocalCopilotStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

import { buildSystemPrompt } from '@/agent/context'
import { createModelClient } from '@/agent/models/router'
import { executeToolViaSim } from '@/agent/tools/executor'
import type { AgentMessage } from '@/agent/types'
import type { BrainChatRequest } from '@/protocol'
import type { SSEWriter } from '@/stream/writer'

const DEFAULT_MAX_STEPS = 8

/**
 * The ReAct loop: plan → tool → observe → answer.
 *
 * Each step asks the model for the next move. If it returns tool calls we run
 * them through Sim and feed the results back; if it returns only text we treat
 * that as the final answer. A step budget guarantees termination.
 */
export async function runAgentLoop(request: BrainChatRequest, sse: SSEWriter): Promise<void> {
  const model = createModelClient(request.provider, request.model, request.apiKey)
  const systemPrompt = buildSystemPrompt(request)
  const maxSteps = request.maxSteps ?? DEFAULT_MAX_STEPS

  const messages: AgentMessage[] = request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  for (let step = 0; step < maxSteps; step++) {
    if (sse.isClosed) return

    const result = await model.streamStep({ systemPrompt, messages, tools: request.tools }, (delta) =>
      sse.write({ type: 'text', delta })
    )

    if (result.toolCalls.length === 0) {
      sse.write({ type: 'complete', status: 'complete' })
      return
    }

    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls })

    for (const call of result.toolCalls) {
      const args = parseArgs(call.argsJson)
      sse.write({ type: 'tool_call', id: call.id, name: call.name, args })

      const response = await executeToolViaSim(request.toolExec, call.name, args)
      const isError = !response.success
      const observation = isError
        ? `Error: ${response.error ?? 'unknown error'}`
        : JSON.stringify(response.result ?? null)

      sse.write({
        type: 'tool_result',
        id: call.id,
        name: call.name,
        result: isError ? response.error : response.result,
        isError,
      })

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: observation,
      })
    }
  }

  sse.write({
    type: 'complete',
    status: 'complete',
    message: `Reached the ${maxSteps}-step limit before finishing.`,
  })
}

function parseArgs(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

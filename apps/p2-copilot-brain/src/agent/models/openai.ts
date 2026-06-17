import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { AgentMessage, ModelClient, ModelStepInput, ModelStepResult, TextSink } from '@/agent/types'

/**
 * OpenAI-compatible chat-completions client with streaming function calling.
 */
export class OpenAIModelClient implements ModelClient {
  private readonly client: OpenAI
  private readonly model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async streamStep(input: ModelStepInput, onText: TextSink): Promise<ModelStepResult> {
    const messages = toOpenAIMessages(input.systemPrompt, input.messages)
    const tools = toOpenAITools(input.tools)

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    })

    let text = ''
    const toolCallsByIndex = new Map<number, { id: string; name: string; argsJson: string }>()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      if (delta.content) {
        text += delta.content
        onText(delta.content)
      }

      for (const tc of delta.tool_calls ?? []) {
        const existing = toolCallsByIndex.get(tc.index) ?? { id: '', name: '', argsJson: '' }
        if (tc.id) existing.id = tc.id
        if (tc.function?.name) existing.name = tc.function.name
        if (tc.function?.arguments) existing.argsJson += tc.function.arguments
        toolCallsByIndex.set(tc.index, existing)
      }
    }

    const toolCalls = [...toolCallsByIndex.values()]
      .filter((tc) => tc.name)
      .map((tc) => ({
        id: tc.id || `call_${tc.name}_${Math.random().toString(36).slice(2, 10)}`,
        name: tc.name,
        argsJson: tc.argsJson || '{}',
      }))

    return { text, toolCalls }
  }
}

function toOpenAITools(tools: ModelStepInput['tools']): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function toOpenAIMessages(
  systemPrompt: string,
  messages: AgentMessage[]
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }]

  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls?.length
          ? msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.argsJson },
            }))
          : undefined,
      })
    } else {
      out.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content })
    }
  }

  return out
}

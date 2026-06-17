import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages'
import type { AgentMessage, ModelClient, ModelStepInput, ModelStepResult, TextSink } from '@/agent/types'

const DEFAULT_MAX_TOKENS = 4096

/**
 * Anthropic Claude client with streaming tool use.
 */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic
  private readonly model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async streamStep(input: ModelStepInput, onText: TextSink): Promise<ModelStepResult> {
    const tools = toAnthropicTools(input.tools)

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: input.systemPrompt,
      messages: toAnthropicMessages(input.messages),
      tools: tools.length > 0 ? tools : undefined,
    })

    stream.on('text', (delta) => onText(delta))

    const final = await stream.finalMessage()

    let text = ''
    const toolCalls: ModelStepResult['toolCalls'] = []
    for (const block of final.content) {
      if (block.type === 'text') {
        text += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          argsJson: JSON.stringify(block.input ?? {}),
        })
      }
    }

    return { text, toolCalls }
  }
}

function toAnthropicTools(tools: ModelStepInput['tools']): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Tool['input_schema'],
  }))
}

function toAnthropicMessages(messages: AgentMessage[]): MessageParam[] {
  const out: MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = []
      if (msg.content) content.push({ type: 'text', text: msg.content })
      for (const tc of msg.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: safeParse(tc.argsJson),
        })
      }
      out.push({ role: 'assistant', content })
    } else {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.toolCallId, content: msg.content }],
      })
    }
  }

  return out
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

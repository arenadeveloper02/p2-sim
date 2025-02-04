import { BlockConfig } from '../types'
import { AgentIcon } from '@/components/icons'
import { MODEL_TOOLS, ModelType } from '../consts'
import { ToolResponse } from '@/tools/types'

interface AgentResponse extends ToolResponse {
  output: {
    content: string
    model: string
    tokens?: {
      prompt?: number
      completion?: number
      total?: number
    }
    toolCalls?: {
      list: Array<{
        name: string
        arguments: Record<string, any>
      }>
      count: number
    }
  }
}

export const AgentBlock: BlockConfig<AgentResponse> = {
  type: 'agent',
  toolbar: {
    title: 'Agent',
    description: 'Add an AI agent with tool access',
    bgColor: '#7F2FFF',
    icon: AgentIcon,
    category: 'blocks',
  },
  tools: {
    access: ['openai_chat', 'anthropic_chat', 'google_chat', 'xai_chat', 'deepseek_chat', 'deepseek_reasoner'],
    config: {
      tool: (params: Record<string, any>) => {
        const model = params.model || 'gpt-4o'
        if (!model) {
          throw new Error('No model selected')
        }
        const tool = MODEL_TOOLS[model as ModelType]
        if (!tool) {
          throw new Error(`Invalid model selected: ${model}`)
        }
        return tool
      }
    }
  },
  workflow: {
    inputs: {
      systemPrompt: { type: 'string', required: true },
      context: { type: 'string', required: false },
      model: { type: 'string', required: true },
      apiKey: { type: 'string', required: true },
      responseFormat: { type: 'json', required: false },
      temperature: { type: 'number', required: false },
      tools: { type: 'json', required: false }
    },
    outputs: {
      response: {
        type: {
          content: 'string',
          model: 'string',
          tokens: 'any',
          toolCalls: 'any'
        }
      }
    },
    subBlocks: [
      {
        id: 'systemPrompt',
        title: 'System Prompt',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Enter system prompt...'
      },
      {
        id: 'context',
        title: 'Context',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter context or user message...'
      },
      {
        id: 'model',
        title: 'Model',
        type: 'dropdown',
        layout: 'half',
        options: Object.keys(MODEL_TOOLS)
      },
      {
        id: 'temperature',
        title: 'Temperature',
        type: 'slider',
        layout: 'half',
        min: 0,
        max: 2,
      },
      {
        id: 'apiKey',
        title: "API Key",
        type: "short-input",
        layout: "full",
        placeholder: "Enter your API key",
        password: true,
        connectionDroppable: false
      },
      {
        id: 'tools',
        title: 'Tools',
        type: 'tool-input',
        layout: 'full'
      },
      {
        id: 'responseFormat',
        title: 'Response Format',
        type: 'code',
        layout: 'full'
      },
    ]
  }
}
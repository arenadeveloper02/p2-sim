import { AgentIcon } from '@/components/icons'
import { BlockConfig } from '../types'
import { ChatResponse } from '@/tools/openai/chat'
import { MODEL_TOOLS, ModelType } from '../consts'

export const AgentBlock: BlockConfig<ChatResponse> = {
  type: 'agent',
  toolbar: {
    title: 'Agent',
    description: 'Use any LLM',
    bgColor: '#7F2FFF',
    icon: AgentIcon,
    category: 'basic',
  },
  tools: {
    access: ['openai.chat', 'anthropic.chat', 'google.chat', 'xai.chat', 'deepseek.chat', 'deepseek.reasoner'],
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
      apiKey: { type: 'string', required: true },
      responseFormat: { type: 'json', required: false },
      temperature: { type: 'number', required: false }
    },
    outputs: {
      response: {
        type: {
          content: 'string',
          model: 'string',
          tokens: 'any',
          reasoning_tokens: 'any'
        }
      }
    },
    subBlocks: [
      {
        id: 'systemPrompt',
        title: 'System Prompt',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Enter prompt'
      },
      {
        id: 'context',
        title: 'Context',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter text'
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
        id: 'responseFormat',
        title: 'Response Format',
        type: 'code',
        layout: 'full'
      }
    ]
  }
}
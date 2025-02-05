import { ConnectIcon } from '@/components/icons'
import { CodeExecutionOutput } from '@/tools/function/execute'
import { BlockConfig } from '../types'
import { MODEL_TOOLS, ModelType } from '../consts'

const routerPrompt = (
  prompt: string
) => `You are an intelligent routing agent responsible for directing workflow requests to the most appropriate block. Your task is to analyze the input and determine the single most suitable destination based on the request.

Key Instructions:
1. You MUST choose exactly ONE destination from the IDs of the blocks in the workflow. The destination must be a valid block id.

2. Analysis Framework:
   - Carefully evaluate the intent and requirements of the request
   - Consider the primary action needed
   - Match the core functionality with the most appropriate destination

Routing Request: ${prompt}

Response Format:
Return ONLY the destination id as a single word, lowercase, no punctuation or explanation.
Example: "2acd9007-27e8-4510-a487-73d3b825e7c1"`

export const RouterBlock: BlockConfig<CodeExecutionOutput> = {
  type: 'router',
  toolbar: {
    title: 'Router',
    description: 'Add a router',
    bgColor: '#28C43F',
    icon: ConnectIcon,
    category: 'blocks',
  },
  tools: {
    access: [
      'openai_chat',
      'anthropic_chat',
      'google_chat',
      'xai_chat',
      'deepseek_chat',
      'deepseek_reasoner',
    ],
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
      },
    },
  },
  workflow: {
    inputs: {
      code: { type: 'string', required: true },
    },
    outputs: {
      response: {
        type: {
          result: 'any',
          stdout: 'string',
        },
      },
    },
    subBlocks: [
      {
        id: 'prompt',
        title: 'Prompt',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Route to the correct block based on the input...',
      },
      {
        id: 'model',
        title: 'Model',
        type: 'dropdown',
        layout: 'full',
        options: Object.keys(MODEL_TOOLS),
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your API key',
        password: true,
        connectionDroppable: false,
      },
      {
        id: 'systemPrompt',
        title: 'System Prompt',
        type: 'code',
        layout: 'full',
        hidden: true,
        value: (params: Record<string, any>) => {
          return routerPrompt(params.prompt || '')
        },
      },
    ],
  },
}

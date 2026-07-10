import { ChartBarIcon } from '@/components/icons'
import type { BlockConfig, ParamType } from '@/blocks/types'
import { AuthMode, IntegrationType } from '@/blocks/types'
import {
  getAgentModelOptions,
  getProviderCredentialSubBlocks,
  PROVIDER_CREDENTIAL_INPUTS,
} from '@/blocks/utils'
import { getBaseModelProviders } from '@/providers/models'
import type { ProviderId } from '@/providers/types'
import type { ToolResponse } from '@/tools/types'

interface GraphGeneratorResponse extends ToolResponse {
  output: {
    charts: unknown[]
    count: number
    content: string
    model: string
    tokens?: {
      prompt?: number
      completion?: number
      total?: number
    }
    cost?: {
      input: number
      output: number
      total: number
    }
  }
}

export const GraphGeneratorBlock: BlockConfig<GraphGeneratorResponse> = {
  type: 'graph_generator',
  name: 'Graph Generator',
  description: 'Generate ECharts graphs from data',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Generate one or more ECharts chart configurations from structured data and a natural-language visualization request. Returns normalized chart options for downstream blocks and chat rendering.',
  docsLink: 'https://docs.sim.ai/workflows/blocks/graph_generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#4D5FFF',
  icon: ChartBarIcon,
  subBlocks: [
    {
      id: 'userInput',
      title: 'User Input',
      type: 'long-input',
      required: true,
      placeholder: 'What to visualize — e.g. top campaigns by CTR',
      defaultValue: '<start.input>',
    },
    {
      id: 'data',
      title: 'Data',
      type: 'long-input',
      required: true,
      placeholder: 'Reference upstream data — e.g. <googleadsv11.results>',
    },
    {
      id: 'model',
      title: 'Model',
      type: 'combobox',
      placeholder: 'Type or select a model...',
      required: true,
      defaultValue: 'gpt-4o',
      searchable: true,
      options: getAgentModelOptions,
      commandSearchable: true,
    },
    ...getProviderCredentialSubBlocks(),
  ],
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
      tool: (params: Record<string, unknown>) => {
        const model = (params.model as string) || 'gpt-4o'
        const tool = getBaseModelProviders()[model as ProviderId]
        if (!tool) {
          throw new Error(`Invalid model selected: ${model}`)
        }
        return tool
      },
    },
  },
  inputs: {
    userInput: { type: 'string' as ParamType, description: 'Visualization request or question' },
    data: { type: 'json' as ParamType, description: 'Data to visualize' },
    model: { type: 'string' as ParamType, description: 'AI model to use' },
    ...PROVIDER_CREDENTIAL_INPUTS,
  },
  outputs: {
    charts: { type: 'json', description: 'ECharts option objects' },
    count: { type: 'number', description: 'Number of charts returned' },
    content: {
      type: 'string',
      description: 'Normalized chart JSON wrapper for chat rendering, or plain-text fallback',
    },
    model: { type: 'string', description: 'Model used for generation' },
    tokens: { type: 'json', description: 'Token usage statistics' },
    cost: { type: 'json', description: 'Cost of the API call' },
  },
}

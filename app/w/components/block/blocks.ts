import { AgentIcon, ApiIcon, ConditionalIcon } from '@/components/icons'

export interface SubBlockConfig {
  title: string
  type: 'short-text' | 'long-text' | 'dropdown' | 'slider' | 'group'
  options?: string[] // For dropdown
  min?: number // For slider
  max?: number // For slider
  layout?: 'full' | 'half' // Controls if the block takes full width or shares space
}

export interface BlockConfig {
  type: string
  toolbar: {
    title: string
    description: string
    bgColor: string
    icon: any
    category: 'basic' | 'advanced'
  }
  workflow: {
    inputs: { [key: string]: string }
    outputs: { [key: string]: string }
    subBlocks: SubBlockConfig[]
  }
}

export const BLOCKS: BlockConfig[] = [
  {
    type: 'agent',
    toolbar: {
      title: 'Agent',
      description: 'Use any LLM',
      bgColor: '#7F2FFF',
      icon: AgentIcon,
      category: 'basic',
    },
    workflow: {
      inputs: {
        prompt: 'string',
      },
      outputs: {
        response: 'string',
      },
      subBlocks: [
        {
          title: 'System Prompt',
          type: 'long-text',
          layout: 'full',
        },
        {
          title: 'Model',
          type: 'dropdown',
          layout: 'half',
          options: ['GPT-4', 'GPT-3.5', 'Claude'],
        },
        {
          title: 'Temperature',
          type: 'slider',
          layout: 'half',
          min: 0,
          max: 2,
        },
        
      ],
    },
  },
  {
    type: 'api',
    toolbar: {
      title: 'API',
      description: 'Connect to any API',
      bgColor: '#2F55FF',
      icon: ApiIcon,
      category: 'basic',
    },
    workflow: {
      inputs: {
        url: 'string',
        method: 'string',
      },
      outputs: {
        response: 'string',
      },
      subBlocks: [
        {
          title: 'URL',
          type: 'long-text',
        },
        {
          title: 'Method',
          type: 'dropdown',
          options: ['GET', 'POST', 'PUT', 'DELETE'],
        },
      ],
    },
  },
  {
    type: 'conditional',
    toolbar: {
      title: 'Conditional',
      description: 'Create branching logic',
      bgColor: '#FF972F',
      icon: ConditionalIcon,
      category: 'basic',
    },
    workflow: {
      inputs: {
        // Add conditional-specific inputs
      },
      outputs: {
        // Add conditional-specific outputs
      },
      subBlocks: [
        {
          title: 'Condition',
          type: 'dropdown',
          options: ['True', 'False'],
        },
        {
          title: 'Action',
          type: 'dropdown',
          options: ['Do Something', 'Do Nothing'],
        },
      ],
    },
  },
]
import { AgentIcon } from '@/components/icons'
import { BlockConfig } from '../types/block'

export const AgentBlock: BlockConfig = {
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
      context: 'string',
    },
    outputs: {
      response: 'string',
      tokens: 'number',
    },
    subBlocks: [
      {
        title: 'System Prompt',
        type: 'long-input',
        layout: 'full',
      },
      {
        title: 'Model',
        type: 'dropdown',
        layout: 'half',
        options: ['GPT-4', 'GPT-3.5', 'Claude', 'Gemini'],
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
}
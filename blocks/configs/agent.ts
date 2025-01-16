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
    outputType: {
      default: 'string',
      dependsOn: {
        subBlockId: 'responseFormat',
        condition: {
          whenEmpty: 'string',
          whenFilled: 'json'
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
        placeholder: 'Enter text',
      },
      {
        id: 'model',
        title: 'Model',
        type: 'dropdown',
        layout: 'half',
        options: ['GPT-4o', 'Gemini 2.0', 'Claude 3.5 Sonnet', 'DeepSeek V3', 'Grok 2'],
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
        password: true
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
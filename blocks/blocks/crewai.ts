import { BlockConfig } from '../types'
import { CrewAIIcon } from '@/components/icons'

export const CrewAIVisionBlock: BlockConfig = {
  type: 'crewaivision',
  toolbar: {
    title: 'CrewAI Vision Tool',
    description: 'Analyze images using vision models',
    bgColor: '#C0392B',
    icon: CrewAIIcon,
    category: 'advanced'
  },
  tools: {
    access: ['crewai.vision']
  },
  workflow: {
    inputs: {
      apiKey: { type: 'string', required: true },
      imageUrl: { type: 'string', required: true },
      model: { type: 'string', required: false },
      prompt: { type: 'string', required: false }
    },
    outputs: {
      response: {
        type: {
          text: 'string',
          model: 'string',
          tokens: 'number'
        }
      }
    },
    subBlocks: [
      {
        id: 'imageUrl',
        title: 'Image URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter publicly accessible image URL'
      },
      {
        id: 'model',
        title: 'Vision Model',
        type: 'dropdown',
        layout: 'half',
        options: [
          'gpt-4o',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229'
        ]
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your API key',
        password: true
      },
      {
        id: 'prompt',
        title: 'Custom Prompt',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Enter custom prompt for image analysis (optional)'
      }
    ]
  }
} 
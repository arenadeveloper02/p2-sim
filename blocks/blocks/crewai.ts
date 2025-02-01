import { BlockConfig } from '../types'
import { CrewAIIcon } from '@/components/icons'
import { VisionResponse } from '@/tools/crewai/vision'

export const CrewAIVisionBlock: BlockConfig<VisionResponse> = {
  type: 'crewai_vision',
  toolbar: {
    title: 'CrewAI Vision Tool',
    description: 'Analyze images with vision models',
    bgColor: '#FF5A50',
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
          content: 'string',
          model: 'any',
          tokens: 'any'
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
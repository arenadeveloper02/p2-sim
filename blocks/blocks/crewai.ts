import { BlockConfig } from '../types'
import { CrewAIIcon } from '@/components/icons'

export const CrewAIVisionBlock: BlockConfig = {
  type: 'crewaivision',
  toolbar: {
    title: 'CrewAI Vision',
    description: 'Analyze images with CrewAI Vision API',
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
      imageUrl: { type: 'string', required: false },
      base64Image: { type: 'string', required: false },
      model: { type: 'string', required: false }
    },
    outputs: {
      response: 'any'
    },
    subBlocks: [
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your CrewAI API key',
        password: true
      },
      {
        id: 'imageUrl',
        title: 'Image URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter image URL'
      },
      {
        id: 'base64Image',
        title: 'Base64 Image',
        type: 'code',
        layout: 'full',
        placeholder: 'Paste base64-encoded data'
      },
      {
        id: 'model',
        title: 'Vision Model',
        type: 'dropdown',
        layout: 'half',
        options: ['vision-latest', 'vision-beta']
      }
    ]
  }
} 
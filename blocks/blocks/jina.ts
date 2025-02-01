import { JinaAIIcon } from '@/components/icons'
import { BlockConfig } from '../types'
import { ReadUrlResponse } from '@/tools/jina/reader'

export const JinaBlock: BlockConfig<ReadUrlResponse> = {
  type: 'jina_reader',
  toolbar: {
    title: 'Jina Reader',
    description: 'Convert website content into text',
    bgColor: '#1A1A1A',
    icon: JinaAIIcon,
    category: 'advanced',
  },
  tools: {
    access: ['jina.readurl']
  },
  workflow: {
    inputs: {
      url: { type: 'string', required: true },
      useReaderLMv2: { type: 'boolean', required: false },
      removeImages: { type: 'boolean', required: false },
      gatherLinks: { type: 'boolean', required: false },
      jsonResponse: { type: 'boolean', required: false }
    },
    outputs: {
      response: {
        type: {
          content: 'string'
        }
      }
    },
    subBlocks: [
      {
        id: 'url',
        title: 'URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter URL to read',
      },
      {
        id: 'useReaderLMv2',
        title: 'Use ReaderLM v2',
        type: 'switch',
        layout: 'half',
      },
      {
        id: 'removeImages',
        title: 'Remove Images',
        type: 'switch',
        layout: 'half',
      },
      {
        id: 'gatherLinks',
        title: 'Gather Links',
        type: 'switch',
        layout: 'half',
      },
      {
        id: 'jsonResponse',
        title: 'JSON Response',
        type: 'switch',
        layout: 'half',
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter API Key (optional)',
        password: true
      }
    ],
  },
} 

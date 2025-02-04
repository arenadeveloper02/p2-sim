import { JinaAIIcon } from '@/components/icons'
import { BlockConfig } from '../types'
import { ReadUrlResponse } from '@/tools/jina/reader'

export const JinaBlock: BlockConfig<ReadUrlResponse> = {
  type: 'jina_reader',
  toolbar: {
    title: 'Jina Reader',
    description: 'Convert website content into text',
    bgColor: '#333333',
    icon: JinaAIIcon,
    category: 'tools',
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
        id: 'options',
        title: 'Options',
        type: 'checkbox-list',
        layout: 'half',
        options: [
          { label: 'Use ReaderLM v2', id: 'useReaderLMv2' },
          { label: 'Remove Images', id: 'removeImages' },
          { label: 'Gather Links', id: 'gatherLinks' },
          { label: 'JSON Response', id: 'jsonResponse' }
        ]
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

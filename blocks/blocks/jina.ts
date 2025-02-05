import { JinaAIIcon } from '@/components/icons'
import { ReadUrlResponse } from '@/tools/jina/reader'
import { BlockConfig } from '../types'

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
    access: ['jina_readurl'],
  },
  workflow: {
    inputs: {
      url: { type: 'string', required: true },
      useReaderLMv2: { type: 'boolean', required: false },
      gatherLinks: { type: 'boolean', required: false },
      jsonResponse: { type: 'boolean', required: false },
      apiKey: { type: 'string', required: true },
    },
    outputs: {
      response: {
        type: {
          content: 'string',
        },
      },
    },
    subBlocks: [
      {
        id: 'url',
        title: 'URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter URL to extract content from',
      },
      {
        id: 'options',
        title: 'Options',
        type: 'checkbox-list',
        layout: 'full',
        options: [
          { id: 'useReaderLMv2', label: 'Use Reader LM v2' },
          { id: 'gatherLinks', label: 'Gather Links' },
          { id: 'jsonResponse', label: 'JSON Response' },
        ],
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your Jina API key',
        password: true,
      },
    ],
  },
}

import { BlockConfig } from '../types'
import { SerperIcon } from '@/components/icons'
import { SearchResponse } from '@/tools/serper/search'

export const SerperBlock: BlockConfig<SearchResponse> = {
  type: 'serper_search',
  toolbar: {
    title: 'Web Search',
    description: 'Search the web',
    bgColor: '#4285F4', // Google blue
    icon: SerperIcon,
    category: 'tools',
  },
  tools: {
    access: ['serper_search']
  },
  workflow: {
    inputs: {
      query: { type: 'string', required: true },
      apiKey: { type: 'string', required: true },
      num: { type: 'number', required: false },
      gl: { type: 'string', required: false },
      hl: { type: 'string', required: false },
      type: { type: 'string', required: false }
    },
    outputs: {
      response: {
        type: {
          searchResults: 'json'
        }
      }
    },
    subBlocks: [
      {
        id: 'query',
        title: 'Search Query',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your search query...'
      },
      {
        id: 'type',
        title: 'Search Type',
        type: 'dropdown',
        layout: 'half',
        options: ['search', 'news', 'places', 'images']
      },
      {
        id: 'num',
        title: 'Number of Results',
        type: 'dropdown',
        layout: 'half',
        options: ['10', '20', '30', '40', '50', '100']
      },
      {
        id: 'gl',
        title: 'Country',
        type: 'dropdown',
        layout: 'half',
        options: [
          'US',
          'GB',
          'CA',
          'AU',
          'DE',
          'FR',
          'ES',
          'IT',
          'JP',
          'KR'
        ]
      },
      {
        id: 'hl',
        title: 'Language',
        type: 'dropdown',
        layout: 'half',
        options: [
          'en',
          'es',
          'fr',
          'de',
          'it',
          'pt',
          'ja',
          'ko',
          'zh'
        ]
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your Serper API key',
        password: true
      }
    ]
  }
} 
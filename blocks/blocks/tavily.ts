import { TavilyIcon } from '@/components/icons'
import { ExtractResponse } from '@/tools/tavily/extract'
import { SearchResponse } from '@/tools/tavily/search'
import { BlockConfig } from '../types'

export const TavilySearchBlock: BlockConfig<SearchResponse> = {
  type: 'tavily_search',
  toolbar: {
    title: 'Tavily Search',
    description: 'Search the web using Tavily AI',
    bgColor: '#0066FF',
    icon: TavilyIcon,
    category: 'tools',
  },
  tools: {
    access: ['tavily_search'],
  },
  workflow: {
    inputs: {
      query: { type: 'string', required: true },
      apiKey: { type: 'string', required: true },
      max_results: { type: 'number', required: false },
    },
    outputs: {
      response: {
        type: {
          query: 'string',
          results: 'json',
          response_time: 'number',
        },
      },
    },
    subBlocks: [
      {
        id: 'query',
        title: 'Search Query',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your search query...',
      },
      {
        id: 'max_results',
        title: 'Max Results',
        type: 'dropdown',
        layout: 'half',
        options: ['5', '10', '15', '20'],
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your Tavily API key',
        password: true,
      },
    ],
  },
}

export const TavilyExtractBlock: BlockConfig<ExtractResponse> = {
  type: 'tavily_extract',
  toolbar: {
    title: 'Tavily Extract',
    description: 'Scrape website content',
    bgColor: '#0066FF',
    icon: TavilyIcon,
    category: 'tools',
  },
  tools: {
    access: ['tavily_extract'],
  },
  workflow: {
    inputs: {
      urls: { type: 'string', required: true },
      apiKey: { type: 'string', required: true },
      extract_depth: { type: 'string', required: false },
    },
    outputs: {
      response: {
        type: {
          results: 'json',
          failed_results: 'any',
          response_time: 'number',
        },
      },
    },
    subBlocks: [
      {
        id: 'urls',
        title: 'URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter URL to extract content from...',
      },
      {
        id: 'extract_depth',
        title: 'Extract Depth',
        type: 'dropdown',
        layout: 'half',
        options: ['basic', 'advanced'],
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your Tavily API key',
        password: true,
      },
    ],
  },
}

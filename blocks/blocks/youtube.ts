import { YouTubeIcon } from '@/components/icons'
import { YouTubeSearchResponse } from '@/tools/youtube/search'
import { BlockConfig } from '../types'

export const YouTubeSearchBlock: BlockConfig<YouTubeSearchResponse> = {
  type: 'youtube_search',
  toolbar: {
    title: 'YouTube Search',
    description: 'Search for videos on YouTube',
    bgColor: '#FF0000',
    icon: YouTubeIcon,
    category: 'tools',
  },
  tools: {
    access: ['youtube_search'],
  },
  workflow: {
    inputs: {
      apiKey: { type: 'string', required: true },
      query: { type: 'string', required: true },
      maxResults: { type: 'number', required: false },
    },
    outputs: {
      response: {
        type: {
          items: 'json',
          totalResults: 'number',
        },
      },
    },
    subBlocks: [
      {
        id: 'query',
        title: 'Search Query',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter search query',
      },
      {
        id: 'apiKey',
        title: 'YouTube API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter YouTube API Key',
        password: true,
      },
      {
        id: 'maxResults',
        title: 'Max Results',
        type: 'slider',
        layout: 'half',
        min: 0,
        max: 20,
      },
    ],
  },
}

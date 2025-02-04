import { BlockConfig } from '../types'
import { FirecrawlIcon } from '@/components/icons'
import { ScrapeResponse } from '@/tools/firecrawl/scrape'

export const FirecrawlScrapeBlock: BlockConfig<ScrapeResponse> = {
  type: 'firecrawl_scrape',
  toolbar: {
    title: 'Firecrawl Scraper',
    description: 'Scrape website content',
    bgColor: '#FF613A',
    icon: FirecrawlIcon,
    category: 'tools'
  },
  tools: {
    access: ['firecrawl_scrape']
  },
  workflow: {
    inputs: {
      apiKey: { type: 'string', required: true },
      url: { type: 'string', required: true },
      scrapeOptions: { type: 'json', required: false }
    },
    outputs: {
      response: {
        type: {
          markdown: 'string',
          html: 'any',
          metadata: 'json'
        }
      }
    },
    subBlocks: [
      {
        id: 'url',
        title: 'Website URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter the webpage URL to scrape'
      },
      {
        id: 'onlyMainContent',
        title: 'Only Main Content',
        type: 'switch',
        layout: 'half'
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your Firecrawl API key',
        password: true
      },
    ]
  }
} 

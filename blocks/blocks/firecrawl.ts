import { BlockConfig } from '../types'
import { FirecrawlIcon } from '@/components/icons'

export const FirecrawlScrapeBlock: BlockConfig = {
  type: 'firecrawlscrape',
  toolbar: {
    title: 'Firecrawl Scraper',
    description: 'Extract clean content from any webpage',
    bgColor: '#FF6B6B',
    icon: FirecrawlIcon,
    category: 'advanced'
  },
  tools: {
    access: ['firecrawl.scrape']
  },
  workflow: {
    inputs: {
      apiKey: { type: 'string', required: true },
      url: { type: 'string', required: true },
      scrapeOptions: { type: 'json', required: false }
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
        placeholder: 'Enter your Firecrawl API key',
        password: true
      },
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
      }
    ]
  }
} 

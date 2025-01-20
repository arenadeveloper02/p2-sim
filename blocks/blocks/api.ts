import { ApiIcon } from '@/components/icons'
import { BlockConfig } from '../types'

export const ApiBlock: BlockConfig = {
  type: 'api',
  toolbar: {
    title: 'API',
    description: 'Use any API',
    bgColor: '#2F55FF',
    icon: ApiIcon,
    category: 'basic',
  },
  tools: {
    access: ['http.request']
  },
  workflow: {
    outputType: 'any',
    inputs: {
      url: 'string',
      method: 'string',
      headers: 'json',
      body: 'json'
    },
    subBlocks: [
      {
        id: 'url',
        title: 'URL',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter URL',
      },
      {
        id: 'method',
        title: 'Method',
        type: 'dropdown',
        layout: 'half',
        options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      {
        id: 'headers',
        title: 'Headers',
        type: 'table',
        layout: 'full',
        columns: ['Key', 'Value'],
      },
      {
        id: 'body',
        title: 'Body',
        type: 'code',
        layout: 'full',
      },
    ],
  },
}
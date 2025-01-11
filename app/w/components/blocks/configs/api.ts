import { ApiIcon } from '@/components/icons'
import { BlockConfig } from '../types/block'

export const ApiBlock: BlockConfig = {
  type: 'api',
  toolbar: {
    title: 'API',
    description: 'Use any API',
    bgColor: '#2F55FF',
    icon: ApiIcon,
    category: 'basic',
  },
  workflow: {
    inputs: {
      url: 'string',
      method: 'string',
      headers: 'object',
      body: 'string',
    },
    outputs: {
      response: 'string',
      statusCode: 'number',
    },
    subBlocks: [
      {
        title: 'URL',
        type: 'short-input',
        layout: 'full',
      },
      {
        title: 'Method',
        type: 'dropdown',
        layout: 'half',
        options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      {
        title: 'Headers',
        type: 'long-input',
        layout: 'full',
      },
      {
        title: 'Body',
        type: 'long-input',
        layout: 'full',
      },
    ],
  },
}
import { ApiIcon } from '@/components/icons'
import { BlockConfig } from '../types'
import { RequestResponse } from '@/tools/http/request'

export const ApiBlock: BlockConfig<RequestResponse> = {
  type: 'api',
  toolbar: {
    title: 'API',
    description: 'Use any API',
    bgColor: '#2F55FF',
    icon: ApiIcon,
    category: 'blocks',
  },
  tools: {
    access: ['http_request']
  },
  workflow: {
    inputs: {
      url: { type: 'string', required: true },
      method: { type: 'string', required: true },
      headers: { type: 'json', required: false },
      body: { type: 'json', required: false }
    },
    outputs: {
      response: {
        type: {
          data: 'any',
          status: 'number',
          headers: 'json'
        }
      }
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
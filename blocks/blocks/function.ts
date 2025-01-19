import { CodeIcon } from '@/components/icons'
import { BlockConfig } from '../types'
  
export const FunctionBlock: BlockConfig = {
  type: 'function',
  toolbar: {
    title: 'Function',
    description: 'Add custom logic',
    bgColor: '#FF8D2F',
    icon: CodeIcon,
    category: 'advanced',
  },
  tools: {
    access: ['function']
  },
  workflow: {
    outputType: 'json',
    inputs: {
      code: 'string'
    },
    subBlocks: [
      {
        id: 'code',
        title: 'Code',
        type: 'code',
        layout: 'full',
      },  
    ],
  },
}
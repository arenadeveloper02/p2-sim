import { CodeIcon } from '@/components/icons'
import { BlockConfig } from '../types/block'
  
export const FunctionBlock: BlockConfig = {
  type: 'function',
  toolbar: {
    title: 'Function',
    description: 'Add custom logic',
    bgColor: '#FF8D2F',
    icon: CodeIcon,
    category: 'basic',
  },
  workflow: {
    outputType: 'json',
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
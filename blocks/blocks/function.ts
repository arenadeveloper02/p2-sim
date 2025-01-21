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
    access: ['function.execute'],
    config: {
      tool: () => 'function.execute'
    }
  },
  workflow: {
    outputType: 'json',
    subBlocks: [
      {
        id: 'code',
        title: 'Code',
        type: 'code',
        layout: 'full',
        placeholder: 'Enter your code here...'
      }
    ]
  }
}
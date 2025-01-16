import { ConditionalIcon } from '@/components/icons'
import { BlockConfig } from '../types/block'

export const ConditionalBlock: BlockConfig = {
  type: 'conditional',
  toolbar: {
    title: 'Conditional',
    description: 'Add branching logic',
    bgColor: '#FF972F',
    icon: ConditionalIcon,
    category: 'basic',
  },
  workflow: {
    outputType: {
      default: 'boolean'
    },
    subBlocks: [
      {
        title: 'Condition Type',
        type: 'dropdown',
        layout: 'full',
        options: [
          'Equals',
          'Contains',
          'Greater Than',
          'Less Than',
          'Regular Expression',
        ],
      },
      {
        title: 'Value',
        type: 'short-input',
        layout: 'full',
      },
    ],
  },
}
import { InputIcon } from '@/components/icons'
import { BlockConfig } from '../types'

export const InputBlock: BlockConfig = {
  type: 'input',
  toolbar: {
    title: 'Input',
    description: 'Add workflow input',
    bgColor: '#2FB3FF',
    icon: InputIcon,
    category: 'blocks',
  },
  tools: {
    access: [],
  },
  workflow: {
    inputs: {
      code: { type: 'string', required: true },
    },
    outputs: {
      response: {
        type: {
          result: 'any',
          stdout: 'string',
          executionTime: 'number',
        },
      },
    },
    subBlocks: [
      {
        title: 'Input',
        id: 'input',
        type: 'short-input',
        layout: 'full',
      },
    ],
  },
}

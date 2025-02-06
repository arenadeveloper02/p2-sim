import { ConditionalIcon } from '@/components/icons'
import { CodeExecutionOutput } from '@/tools/function/execute'
import { BlockConfig } from '../types'

export const ConditionBlock: BlockConfig<CodeExecutionOutput> = {
  type: 'condition',
  toolbar: {
    title: 'Condition',
    description: 'Add a condition',
    bgColor: '#FF972F',
    icon: ConditionalIcon,
    category: 'blocks',
  },
  tools: {
    access: ['function_execute'],
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
        },
      },
    },
    subBlocks: [
      {
        id: 'conditions',
        type: 'condition-input',
        layout: 'full',
        outputHandle: true,
      },
    ],
  },
}

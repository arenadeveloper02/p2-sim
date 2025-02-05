import { ConditionalIcon } from '@/components/icons'
import { BlockConfig } from '../types'
import { CodeExecutionOutput } from '@/tools/function/execute'

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
    access: ['function_execute']
  },
  workflow: {
    inputs: {
      code: { type: 'string', required: true }
    },
    outputs: {
      response: {
        type: {
          result: 'any',
          stdout: 'string'
        }
      }
    },
    subBlocks: [
      {
        id: 'if',
        title: 'if',
        type: 'code',
        layout: 'full',
        outputHandle: true
      },
      {
        id: 'elseIf',
        title: 'else if',
        type: 'code',
        layout: 'full',
        outputHandle: true
      }
    ],
  },
}
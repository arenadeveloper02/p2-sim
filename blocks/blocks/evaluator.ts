import { ChartBarIcon } from '@/components/icons'
import { ToolResponse } from '@/tools/types'
import { MODEL_TOOLS, ModelType } from '../consts'
import { BlockConfig, ParamType } from '../types'

interface EvaluatorResponse extends ToolResponse {
  output: {
    content: string
    model: string
    tokens?: {
      prompt?: number
      completion?: number
      total?: number
    }
    evaluation: {
      score: number
      reasoning: string
      metrics: Record<string, number>
    }
  }
}

interface EvaluationTarget {
  id: string
  type?: string
  title?: string
  description?: string
  category?: string
  subBlocks?: Record<string, any>
  currentState?: any
  expectedOutput?: any
  actualOutput?: any
}

export const generateEvaluatorPrompt = (prompt: string, target?: EvaluationTarget): string => {
  const basePrompt = `You are an intelligent evaluation agent responsible for assessing the quality and accuracy of workflow outputs. Your task is to analyze the input and provide a detailed evaluation with scoring.

Key Instructions:
1. You MUST provide a numerical score between 0 and 1 (0 being worst, 1 being perfect)
2. You MUST provide detailed reasoning for your evaluation
3. You MUST evaluate based on multiple metrics where applicable

Evaluation Framework:
- Accuracy: How well does the output match the expected result?
- Completeness: Does the output address all aspects of the task?
- Quality: Is the output well-formed and professional?
- Relevance: Is the output relevant to the original request?`

  const targetInfo = target
    ? `

Evaluation Target:
${JSON.stringify(
  {
    id: target.id,
    type: target.type,
    title: target.title,
    description: target.description,
    category: target.category,
    expectedOutput: target.expectedOutput,
    actualOutput: target.actualOutput,
  },
  null,
  2
)}

Evaluation Instructions:
1. Compare the actual output against:
   - Expected output (if provided)
   - Task requirements
   - Quality standards
   - Technical constraints

2. Scoring Criteria:
   - Use objective metrics where possible
   - Consider both technical and functional aspects
   - Factor in any specific requirements or constraints
   - Evaluate against industry best practices`
    : ''

  return `${basePrompt}${targetInfo}

Evaluation Request: ${prompt}

Response Format:
{
  "score": <number between 0 and 1>,
  "reasoning": "<detailed explanation>",
  "metrics": {
    "accuracy": <number between 0 and 1>,
    "completeness": <number between 0 and 1>,
    "quality": <number between 0 and 1>,
    "relevance": <number between 0 and 1>
  }
}

Remember: Your response must be valid JSON following the exact format above.`
}

export const EvaluatorBlock: BlockConfig<EvaluatorResponse> = {
  type: 'evaluator',
  toolbar: {
    title: 'Evaluator',
    description: 'Add an evaluator',
    bgColor: '#FF69B4',
    icon: ChartBarIcon,
    category: 'blocks',
  },
  tools: {
    access: [
      'openai_chat',
      'anthropic_chat',
      'google_chat',
      'xai_chat',
      'deepseek_chat',
      'deepseek_reasoner',
    ],
    config: {
      tool: (params: Record<string, any>) => {
        const model = params.model || 'gpt-4o'
        if (!model) {
          throw new Error('No model selected')
        }
        const tool = MODEL_TOOLS[model as ModelType]
        if (!tool) {
          throw new Error(`Invalid model selected: ${model}`)
        }
        return tool
      },
    },
  },
  workflow: {
    inputs: {
      prompt: { type: 'string' as ParamType, required: true },
      model: { type: 'string' as ParamType, required: true },
      apiKey: { type: 'string' as ParamType, required: true },
      expectedOutput: { type: 'object' as ParamType, required: false },
      actualOutput: { type: 'object' as ParamType, required: true },
    },
    outputs: {
      response: {
        type: {
          content: 'string',
          model: 'string',
          tokens: 'any',
          evaluation: 'json',
        },
      },
    },
    subBlocks: [
      {
        id: 'prompt',
        title: 'Evaluation Prompt',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Evaluate the output based on the following criteria...',
      },
      {
        id: 'model',
        title: 'Model',
        type: 'dropdown',
        layout: 'half',
        options: Object.keys(MODEL_TOOLS),
      },
      {
        id: 'apiKey',
        title: 'API Key',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your API key',
        password: true,
        connectionDroppable: false,
      },
      {
        id: 'expectedOutput',
        title: 'Expected Output',
        type: 'code',
        layout: 'full',
        placeholder: 'Enter the expected output (optional)',
      },
      {
        id: 'actualOutput',
        title: 'Actual Output',
        type: 'code',
        layout: 'full',
        placeholder: 'Enter the actual output to evaluate',
      },
      {
        id: 'systemPrompt',
        title: 'System Prompt',
        type: 'code',
        layout: 'full',
        hidden: true,
        value: (params: Record<string, any>) => {
          return generateEvaluatorPrompt(params.prompt || '', {
            id: 'runtime-evaluation',
            expectedOutput: params.expectedOutput,
            actualOutput: params.actualOutput,
          })
        },
      },
    ],
  },
}

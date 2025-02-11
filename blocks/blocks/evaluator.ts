import { ChartBarIcon } from '@/components/icons'
import { ToolResponse } from '@/tools/types'
import { MODEL_TOOLS, ModelType } from '../consts'
import { BlockConfig, ParamType } from '../types'

interface TargetBlock {
  id: string
  type?: string
  title?: string
  description?: string
  category?: string
  subBlocks?: Record<string, any>
  currentState?: any
}

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
    selectedPath: {
      blockId: string
      blockType: string
      blockTitle: string
    }
  }
}

export const generateEvaluatorPrompt = (
  evaluationCriteria: string,
  content: string,
  targetBlocks?: TargetBlock[]
): string => {
  const basePrompt = `You are an objective evaluation agent. Analyze the content against the provided criteria and determine the next step based on the evaluation score.

Evaluation Instructions:
1. Score the content (0 to 1) using these metrics:
   - Accuracy: How well does it meet requirements?
   - Completeness: Are all aspects addressed?
   - Quality: Is it clear and professional?
   - Relevance: Does it match the criteria?

2. Calculate final score:
   - Average all metrics
   - Round to 2 decimal places

Content:
${content}

Criteria:
${evaluationCriteria}`

  const targetBlocksInfo = targetBlocks
    ? `
Available Destinations:
${targetBlocks
  .map(
    (block) => `
ID: ${block.id}
Type: ${block.type}
Title: ${block.title}
Description: ${block.description}`
  )
  .join('\n---\n')}

Routing Rules:
- Score greater than or equal to 0.85: Choose success path block
- Score less than 0.85: Choose failure path block`
    : ''

  return `${basePrompt}${targetBlocksInfo}

Response Format:
Return ONLY the destination block ID as a single word, no punctuation or explanation.
Example: "2acd9007-27e8-4510-a487-73d3b825e7c1"

Remember: Your response must be ONLY the block ID.`
}

export const EvaluatorBlock: BlockConfig<EvaluatorResponse> = {
  type: 'evaluator',
  toolbar: {
    title: 'Evaluator',
    description: 'Add an evaluator',
    bgColor: '#2FA1FF',
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
      content: { type: 'string' as ParamType, required: true },
    },
    outputs: {
      response: {
        type: {
          content: 'string',
          model: 'string',
          tokens: 'any',
          evaluation: 'json',
          selectedPath: 'json',
        },
      },
    },
    subBlocks: [
      {
        id: 'prompt',
        title: 'Evaluation Criteria',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Evaluate the input based on the following criteria...',
      },
      {
        id: 'content',
        title: 'Content',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter the content to evaluate',
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
        id: 'systemPrompt',
        title: 'System Prompt',
        type: 'code',
        layout: 'full',
        hidden: true,
        value: (params: Record<string, any>) => {
          return generateEvaluatorPrompt(params.prompt || '', params.content || '')
        },
      },
    ],
  },
}

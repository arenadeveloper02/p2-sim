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
    justification: string
    history: Array<{ response: string; justification: string }>
  }
}

export const generateEvaluatorPrompt = (
  evaluationCriteria: string,
  content: string,
  targetBlocks?: TargetBlock[],
  history?: Array<{ response: string; justification: string }>
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
   - Round to 2 decimal places${
     history && history.length > 0
       ? `

Previous Attempts:
${history
  .map(
    (entry, i) => `
Attempt ${i + 1}:
Response: ${entry.response}
Evaluation: ${entry.justification}
---`
  )
  .join('\n')}`
       : ''
   }

Content:
${content}

Criteria:
${evaluationCriteria}`

  // If no target blocks, just return the evaluation without routing
  if (!targetBlocks || targetBlocks.length === 0) {
    return `${basePrompt}

IMPORTANT: When there are no target blocks, you must use exactly "end" as the decision value. Do not use any other word.

Response Format:
Return a JSON object with the following structure:
{
  "decision": "end",  // You must use exactly "end" here - this is a required system keyword
  "justification": "Brief explanation of the pure evaluation of the content. DO NOT include any information about the target blocks."
}

Remember: 
1. Your response must be ONLY the JSON object - no additional text, formatting, or explanation.
2. The "decision" field MUST be exactly "end" - this is a required keyword that the system expects.`
  }

  const targetBlocksInfo = `
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
${
  targetBlocks.length === 1
    ? `- Route back to the only available block (${targetBlocks[0].id}) to continue the iteration`
    : `- Score greater than or equal to 0.85: Choose success path block
- Score less than 0.85: Choose failure path block`
}`

  return `${basePrompt}${targetBlocksInfo}

Response Format:
Return a JSON object with the following structure:
{
  "decision": "block-id-here",
  "justification": "Brief explanation of the pure evaluation of the content. DO NOT include any information about the target blocks."
}

Remember: Your response must be ONLY the JSON object - no additional text, formatting, or explanation.
If there is only one available destination, return that block's ID in the decision field regardless of the score.`
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
      history: { type: 'json' as ParamType, required: false },
    },
    outputs: {
      response: {
        type: {
          content: 'string',
          model: 'string',
          tokens: 'any',
          evaluation: 'json',
          selectedPath: 'json',
          justification: 'string',
          history: 'json',
        },
      },
    },
    subBlocks: [
      {
        id: 'prompt',
        title: 'Evaluation Criteria',
        type: 'eval-input',
        layout: 'full',
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
          return generateEvaluatorPrompt(
            params.prompt || '',
            params.content || '',
            undefined,
            params.history || []
          )
        },
      },
    ],
  },
}

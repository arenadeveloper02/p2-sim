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
    selectedPath: {
      blockId: string
      blockType: string
      blockTitle: string
    }
  }
}

export const generateEvaluatorPrompt = (prompt: string, content: string): string => {
  const basePrompt = `You are an objective and meticulous evaluation agent—your role is to act as an impartial judge. Your task is to evaluate content provided in a separate sub‑block strictly based on the specific evaluation criteria supplied by the user.

Guidelines:
1. First, carefully read the evaluation criteria provided by the user. These criteria define the standards against which the content must be judged.
2. Review the content that has been separately provided.
3. Assess the content on the following key metrics:
   - Accuracy: How precisely does the content align with the defined criteria?
   - Completeness: Does the content thoroughly address every aspect outlined in the criteria?
   - Quality: Is the content clear, coherent, and professionally presented?
   - Relevance: How well does the content match the expectations and requirements stated in the criteria?

Instructions:
- Analyze the content in the context of the provided evaluation criteria.
- Assign a numerical score between 0 (poor) and 1 (excellent) that reflects the overall performance.
- For each metric, compute a score and provide a detailed, step‑by‑step explanation of your evaluation.
- Your final output must be a valid JSON object that strictly matches the following format. Do not include any extra text, commentary, or formatting outside of this JSON structure.

Content to Evaluate:
${content}

Evaluation Request: ${prompt}

Response Format:
{
  "score": <number between 0 and 1>,
  "reasoning": "<detailed explanation, including analysis for each metric>",
  "metrics": {
    "accuracy": <number between 0 and 1>,
    "completeness": <number between 0 and 1>,
    "quality": <number between 0 and 1>,
    "relevance": <number between 0 and 1>
  }
}

Remember: Your evaluation must be entirely unbiased and based solely on the provided criteria and content. Any output outside of the valid JSON format is unacceptable.`

  return basePrompt
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

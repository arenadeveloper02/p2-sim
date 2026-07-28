import { createIdeogramProxyTool } from '@/tools/ideogram/create-tool'
import type {
  IdeogramAsyncResponse,
  IdeogramGenerateV4AsyncParams,
} from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramGenerateV4AsyncTool = createIdeogramProxyTool<
  IdeogramGenerateV4AsyncParams,
  IdeogramAsyncResponse
>({
  id: 'ideogram_generate_v4_async',
  name: 'Ideogram Generate 4.0 Async',
  description: 'Start an Ideogram 4.0 generation asynchronously and deliver results to a webhook',
  operation: 'generate_v4_async',
  params: {
    webhookUrl: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'HTTPS webhook URL that receives the completed generation payload',
    },
    textPrompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Natural-language prompt. Mutually exclusive with jsonPrompt.',
    },
    jsonPrompt: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Structured V4 JSON prompt. Mutually exclusive with textPrompt.',
    },
    resolution: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Ideogram 4.0 resolution (e.g. 2048x2048)',
    },
    renderingSpeed: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Rendering speed: FLASH, TURBO, DEFAULT, or QUALITY',
    },
    enableCopyrightDetection: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Opt into post-generation copyright detection',
    },
  },
  body: (params) => ({
    webhookUrl: params.webhookUrl,
    textPrompt: params.textPrompt,
    jsonPrompt: parseJsonParam(params.jsonPrompt),
    useMagicPrompt: params.useMagicPrompt,
    resolution: params.resolution,
    renderingSpeed: params.renderingSpeed,
    enableCopyrightDetection: params.enableCopyrightDetection,
  }),
  transformOutput: (data) => ({
    generationId: typeof data.generationId === 'string' ? data.generationId : '',
    ...(data.jsonPrompt !== undefined ? { jsonPrompt: data.jsonPrompt } : {}),
    ...(data.magicPromptUsed === true ? { magicPromptUsed: true } : {}),
  }),
  outputs: {
    generationId: {
      type: 'string',
      description: 'Generation ID for polling or webhook correlation',
    },
    jsonPrompt: {
      type: 'json',
      description: 'Structured JSON prompt used when Magic Prompt was enabled',
      optional: true,
    },
    magicPromptUsed: {
      type: 'boolean',
      description: 'True when Magic Prompt rewrote the text prompt before generation',
      optional: true,
    },
  },
})

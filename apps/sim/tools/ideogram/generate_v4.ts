import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramGenerateV4Params, IdeogramImagesResponse } from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramGenerateV4Tool = createIdeogramProxyTool<
  IdeogramGenerateV4Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_generate_v4',
  name: 'Ideogram Generate 4.0',
  description: 'Generate images synchronously with Ideogram 4.0',
  operation: 'generate_v4',
  params: {
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
    useMagicPrompt: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description:
        'When true, rewrites textPrompt into Ideogram JSON prompt format before generating.',
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
    textPrompt: params.textPrompt,
    jsonPrompt: parseJsonParam(params.jsonPrompt),
    useMagicPrompt: params.useMagicPrompt,
    resolution: params.resolution,
    renderingSpeed: params.renderingSpeed,
    enableCopyrightDetection: params.enableCopyrightDetection,
  }),
  transformOutput: (data) => ({
    ...transformImagesOutput(data),
    ...(data.jsonPrompt !== undefined ? { jsonPrompt: data.jsonPrompt } : {}),
    ...(data.magicPromptUsed === true ? { magicPromptUsed: true } : {}),
  }),
  outputs: {
    ...ideogramImagesOutputs,
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

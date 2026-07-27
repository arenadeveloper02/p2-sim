import { createIdeogramProxyTool } from '@/tools/ideogram/create-tool'
import type {
  IdeogramMagicPromptV4Params,
  IdeogramMagicPromptV4Response,
} from '@/tools/ideogram/types'

export const ideogramMagicPromptV4Tool = createIdeogramProxyTool<
  IdeogramMagicPromptV4Params,
  IdeogramMagicPromptV4Response
>({
  id: 'ideogram_magic_prompt_v4',
  name: 'Ideogram Magic Prompt 4.0',
  description: 'Transform a basic prompt into an enhanced Ideogram 4.0 magic prompt',
  operation: 'magic_prompt_v4',
  params: {
    textPrompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Natural-language prompt to enhance',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Target aspect ratio. Defaults to AUTO.',
    },
  },
  body: (params) => ({
    textPrompt: params.textPrompt,
    aspectRatio: params.aspectRatio,
  }),
  transformOutput: (data) => ({
    jsonPrompt: data.jsonPrompt ?? null,
    aspectRatio: typeof data.aspectRatio === 'string' ? data.aspectRatio : '',
  }),
  outputs: {
    jsonPrompt: {
      type: 'json',
      description: 'Structured V4 JSON prompt ready for generate_v4',
    },
    aspectRatio: {
      type: 'string',
      description: 'Resolved aspect ratio',
    },
  },
})

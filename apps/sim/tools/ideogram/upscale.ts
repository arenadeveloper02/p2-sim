import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramImagesResponse, IdeogramUpscaleParams } from '@/tools/ideogram/types'

export const ideogramUpscaleTool = createIdeogramProxyTool<
  IdeogramUpscaleParams,
  IdeogramImagesResponse
>({
  id: 'ideogram_upscale',
  name: 'Ideogram Upscale',
  description: 'Upscale an image with Ideogram',
  operation: 'upscale',
  params: {
    image: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Image to upscale',
    },
    prompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional prompt to guide the upscale',
    },
    resemblance: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Resemblance strength (default 50)',
    },
    detail: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Detail strength (default 50)',
    },
    magicPromptOption: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Magic prompt option: AUTO, ON, or OFF',
    },
    numImages: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of images to generate',
    },
    seed: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Random seed for reproducible generation',
    },
  },
  body: (params) => ({
    image: params.image,
    prompt: params.prompt,
    resemblance: params.resemblance,
    detail: params.detail,
    magicPromptOption: params.magicPromptOption,
    numImages: params.numImages,
    seed: params.seed,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

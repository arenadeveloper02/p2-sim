import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type {
  IdeogramGenerateTransparentV3Params,
  IdeogramImagesResponse,
} from '@/tools/ideogram/types'

export const ideogramGenerateTransparentV3Tool = createIdeogramProxyTool<
  IdeogramGenerateTransparentV3Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_generate_transparent_v3',
  name: 'Ideogram Generate Transparent 3.0',
  description: 'Generate images with a transparent background using Ideogram 3.0',
  operation: 'generate_transparent_v3',
  params: {
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Prompt used to generate the image',
    },
    seed: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Random seed for reproducible generation',
    },
    upscaleFactor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Upscale factor: X1, X2, or X4',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Aspect ratio (e.g. 1x1, 16x9)',
    },
    renderingSpeed: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Rendering speed (FLASH is not supported)',
    },
    magicPrompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Magic prompt option: AUTO, ON, or OFF',
    },
    negativePrompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Description of what to exclude from the image',
    },
    numImages: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of images to generate',
    },
  },
  body: (params) => ({
    prompt: params.prompt,
    seed: params.seed,
    upscaleFactor: params.upscaleFactor,
    aspectRatio: params.aspectRatio,
    renderingSpeed: params.renderingSpeed,
    magicPrompt: params.magicPrompt,
    negativePrompt: params.negativePrompt,
    numImages: params.numImages,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

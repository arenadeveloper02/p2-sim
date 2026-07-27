import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramEditParams, IdeogramImagesResponse } from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramEditTool = createIdeogramProxyTool<IdeogramEditParams, IdeogramImagesResponse>({
  id: 'ideogram_edit',
  name: 'Ideogram Edit',
  description: 'Edit images with a prompt using Ideogram',
  operation: 'edit',
  params: {
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Prompt describing the desired edit',
    },
    images: {
      type: 'file[]',
      required: false,
      visibility: 'user-or-llm',
      description: 'Images to edit (max 10)',
    },
    imageUrls: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Ideogram image URLs to use as references (max 10)',
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
    magicPrompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Magic prompt option: AUTO, ON, or OFF',
    },
    resolution: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Output resolution',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Aspect ratio',
    },
    transparentBackground: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Whether the output should have a transparent background',
    },
  },
  body: (params) => ({
    prompt: params.prompt,
    images: params.images,
    imageUrls: parseJsonParam(params.imageUrls),
    numImages: params.numImages,
    seed: params.seed,
    magicPrompt: params.magicPrompt,
    resolution: params.resolution,
    aspectRatio: params.aspectRatio,
    transparentBackground: params.transparentBackground,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

import {
  createIdeogramProxyTool,
  ideogramImageFileParam,
  ideogramImageUrlParam,
  ideogramImagesOutputs,
  transformImagesOutput,
} from '@/tools/ideogram/create-tool'
import type {
  IdeogramImagesResponse,
  IdeogramReplaceBackgroundV3Params,
} from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramReplaceBackgroundV3Tool = createIdeogramProxyTool<
  IdeogramReplaceBackgroundV3Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_replace_background_v3',
  name: 'Ideogram Replace Background 3.0',
  description: 'Replace an image background with Ideogram 3.0',
  operation: 'replace_background_v3',
  params: {
    image: ideogramImageFileParam,
    imageUrl: ideogramImageUrlParam,
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Prompt describing the desired new background',
    },
    magicPrompt: {
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
    renderingSpeed: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Rendering speed',
    },
    stylePreset: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Style preset name',
    },
    colorPalette: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Color palette JSON',
    },
    styleCodes: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Style codes JSON array',
    },
    styleReferenceImages: {
      type: 'file[]',
      required: false,
      visibility: 'user-or-llm',
      description: 'Style reference images',
    },
  },
  body: (params) => ({
    image: params.image,
    imageUrl: params.imageUrl,
    prompt: params.prompt,
    magicPrompt: params.magicPrompt,
    numImages: params.numImages,
    seed: params.seed,
    renderingSpeed: params.renderingSpeed,
    stylePreset: params.stylePreset,
    colorPalette: parseJsonParam(params.colorPalette),
    styleCodes: parseJsonParam(params.styleCodes),
    styleReferenceImages: params.styleReferenceImages,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

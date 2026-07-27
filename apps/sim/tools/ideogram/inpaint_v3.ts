import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramImagesResponse, IdeogramInpaintV3Params } from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramInpaintV3Tool = createIdeogramProxyTool<
  IdeogramInpaintV3Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_inpaint_v3',
  name: 'Ideogram Inpaint 3.0',
  description: 'Inpaint masked regions of an image with Ideogram 3.0',
  operation: 'inpaint_v3',
  params: {
    image: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Image being edited',
    },
    mask: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Black-and-white mask matching the image size',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Prompt describing the edited result',
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
      description: 'Rendering speed: FLASH, TURBO, DEFAULT, or QUALITY',
    },
    styleType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Style type',
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
    characterReferenceImages: {
      type: 'file[]',
      required: false,
      visibility: 'user-or-llm',
      description: 'Character reference images',
    },
    characterReferenceImagesMask: {
      type: 'file[]',
      required: false,
      visibility: 'user-or-llm',
      description: 'Masks for character reference images',
    },
  },
  body: (params) => ({
    image: params.image,
    mask: params.mask,
    prompt: params.prompt,
    magicPrompt: params.magicPrompt,
    numImages: params.numImages,
    seed: params.seed,
    renderingSpeed: params.renderingSpeed,
    styleType: params.styleType,
    stylePreset: params.stylePreset,
    colorPalette: parseJsonParam(params.colorPalette),
    styleCodes: parseJsonParam(params.styleCodes),
    styleReferenceImages: params.styleReferenceImages,
    characterReferenceImages: params.characterReferenceImages,
    characterReferenceImagesMask: params.characterReferenceImagesMask,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

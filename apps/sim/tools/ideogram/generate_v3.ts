import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramGenerateV3Params, IdeogramImagesResponse } from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramGenerateV3Tool = createIdeogramProxyTool<
  IdeogramGenerateV3Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_generate_v3',
  name: 'Ideogram Generate 3.0',
  description: 'Generate images with Ideogram 3.0',
  operation: 'generate_v3',
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
    resolution: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Ideogram 3.0 resolution. Cannot be used with aspectRatio.',
    },
    aspectRatio: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Aspect ratio (e.g. 1x1, 16x9). Cannot be used with resolution.',
    },
    renderingSpeed: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Rendering speed: FLASH, TURBO, DEFAULT, or QUALITY',
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
    styleType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Style type: AUTO, GENERAL, REALISTIC, DESIGN, or FICTION',
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
      description: 'Color palette as preset name or members JSON',
    },
    styleCodes: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'List of 8-character hexadecimal style codes',
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
    customModelUri: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Custom model URI (model/<name>/version/<version>)',
    },
    enableCopyrightDetection: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Opt into post-generation copyright detection',
    },
  },
  body: (params) => ({
    prompt: params.prompt,
    seed: params.seed,
    resolution: params.resolution,
    aspectRatio: params.aspectRatio,
    renderingSpeed: params.renderingSpeed,
    magicPrompt: params.magicPrompt,
    negativePrompt: params.negativePrompt,
    numImages: params.numImages,
    styleType: params.styleType,
    stylePreset: params.stylePreset,
    colorPalette: parseJsonParam(params.colorPalette),
    styleCodes: parseJsonParam(params.styleCodes),
    styleReferenceImages: params.styleReferenceImages,
    characterReferenceImages: params.characterReferenceImages,
    characterReferenceImagesMask: params.characterReferenceImagesMask,
    customModelUri: params.customModelUri,
    enableCopyrightDetection: params.enableCopyrightDetection,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

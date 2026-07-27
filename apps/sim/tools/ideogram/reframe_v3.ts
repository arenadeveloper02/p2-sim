import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramImagesResponse, IdeogramReframeV3Params } from '@/tools/ideogram/types'
import { parseJsonParam } from '@/tools/ideogram/utils'

export const ideogramReframeV3Tool = createIdeogramProxyTool<
  IdeogramReframeV3Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_reframe_v3',
  name: 'Ideogram Reframe 3.0',
  description: 'Reframe an image to a new resolution with Ideogram 3.0',
  operation: 'reframe_v3',
  params: {
    image: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Image being reframed',
    },
    resolution: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Target Ideogram 3.0 resolution',
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
    resolution: params.resolution,
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

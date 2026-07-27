import { createIdeogramProxyTool, ideogramImagesOutputs, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type { IdeogramImagesResponse, IdeogramRemixV4Params } from '@/tools/ideogram/types'

export const ideogramRemixV4Tool = createIdeogramProxyTool<
  IdeogramRemixV4Params,
  IdeogramImagesResponse
>({
  id: 'ideogram_remix_v4',
  name: 'Ideogram Remix 4.0',
  description: 'Remix an image with Ideogram 4.0 using an initial image and prompt',
  operation: 'remix_v4',
  params: {
    image: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Initial image to remix (JPEG, PNG, or WebP, max 10MB)',
    },
    textPrompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Text prompt that guides the remix',
    },
    imageWeight: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'How strongly the output should resemble the input image',
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
    image: params.image,
    textPrompt: params.textPrompt,
    imageWeight: params.imageWeight,
    resolution: params.resolution,
    renderingSpeed: params.renderingSpeed,
    enableCopyrightDetection: params.enableCopyrightDetection,
  }),
  transformOutput: transformImagesOutput,
  outputs: ideogramImagesOutputs,
})

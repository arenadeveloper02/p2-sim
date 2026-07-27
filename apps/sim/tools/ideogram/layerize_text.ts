import { createIdeogramProxyTool } from '@/tools/ideogram/create-tool'
import type {
  IdeogramLayerizeTextParams,
  IdeogramLayerizeTextResponse,
} from '@/tools/ideogram/types'

export const ideogramLayerizeTextTool = createIdeogramProxyTool<
  IdeogramLayerizeTextParams,
  IdeogramLayerizeTextResponse
>({
  id: 'ideogram_layerize_text',
  name: 'Ideogram Layerize Text',
  description: 'Detect and remove text from an image, returning a text-erased base image',
  operation: 'layerize_text',
  params: {
    image: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Image to analyze for text detection',
    },
    prompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional text description of the image',
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
    seed: params.seed,
  }),
  transformOutput: (data) => ({
    baseImageUrl: typeof data.baseImageUrl === 'string' ? data.baseImageUrl : '',
    originalImageUrl: typeof data.originalImageUrl === 'string' ? data.originalImageUrl : null,
    seed: typeof data.seed === 'number' ? data.seed : 0,
  }),
  outputs: {
    baseImageUrl: {
      type: 'string',
      description: 'URL of the image with detected text removed',
    },
    originalImageUrl: {
      type: 'string',
      description: 'URL of the original image with text intact',
      optional: true,
    },
    seed: { type: 'number', description: 'Seed used for generation' },
  },
})

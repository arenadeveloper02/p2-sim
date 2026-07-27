import { createIdeogramProxyTool } from '@/tools/ideogram/create-tool'
import type {
  IdeogramRemoveBackgroundParams,
  IdeogramRemoveBackgroundResponse,
} from '@/tools/ideogram/types'

export const ideogramRemoveBackgroundTool = createIdeogramProxyTool<
  IdeogramRemoveBackgroundParams,
  IdeogramRemoveBackgroundResponse
>({
  id: 'ideogram_remove_background',
  name: 'Ideogram Remove Background',
  description: 'Remove the background from an image with Ideogram',
  operation: 'remove_background',
  params: {
    image: {
      type: 'file',
      required: true,
      visibility: 'user-or-llm',
      description: 'Image whose background will be removed',
    },
  },
  body: (params) => ({
    image: params.image,
  }),
  transformOutput: (data) => ({
    created: typeof data.created === 'string' ? data.created : null,
    images: Array.isArray(data.images) ? data.images : [],
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
  }),
  outputs: {
    created: { type: 'string', description: 'Request creation timestamp', optional: true },
    images: {
      type: 'array',
      description: 'Foreground image with background removed',
      items: {
        type: 'object',
        description: 'Remove-background image object',
        properties: {
          url: { type: 'string', description: 'Temporary image URL', optional: true },
          isImageSafe: { type: 'boolean', description: 'Whether the image passed safety checks' },
        },
      },
    },
    imageUrls: {
      type: 'array',
      description: 'Non-null image URLs',
      items: { type: 'string', description: 'Image URL' },
    },
  },
})

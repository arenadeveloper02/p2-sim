import {
  createIdeogramProxyTool,
  ideogramImageFileParam,
  ideogramImageUrlParam,
  transformImagesOutput,
} from '@/tools/ideogram/create-tool'
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
    image: ideogramImageFileParam,
    imageUrl: ideogramImageUrlParam,
  },
  body: (params) => ({
    image: params.image,
    imageUrl: params.imageUrl,
  }),
  transformOutput: transformImagesOutput,
  outputs: {
    created: { type: 'string', description: 'Request creation timestamp', optional: true },
    content: { type: 'string', description: 'Primary persisted image URL', optional: true },
    image: {
      type: 'file',
      description: 'Foreground image with background removed',
      optional: true,
    },
    imageUrl: { type: 'string', description: 'Primary persisted image URL', optional: true },
    images: {
      type: 'array',
      description: 'Foreground image with background removed',
      items: {
        type: 'object',
        description: 'Remove-background image object',
        properties: {
          url: { type: 'string', description: 'Persisted image URL', optional: true },
          isImageSafe: { type: 'boolean', description: 'Whether the image passed safety checks' },
        },
      },
    },
    imageUrls: {
      type: 'array',
      description: 'Non-null persisted image URLs',
      items: { type: 'string', description: 'Image URL' },
    },
    s3UploadFailed: {
      type: 'boolean',
      description: 'True when image was saved locally because S3 upload failed',
      optional: true,
    },
  },
})

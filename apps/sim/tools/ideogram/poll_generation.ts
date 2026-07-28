import { createIdeogramProxyTool, transformImagesOutput } from '@/tools/ideogram/create-tool'
import type {
  IdeogramPollGenerationParams,
  IdeogramPollGenerationResponse,
} from '@/tools/ideogram/types'

export const ideogramPollGenerationTool = createIdeogramProxyTool<
  IdeogramPollGenerationParams,
  IdeogramPollGenerationResponse
>({
  id: 'ideogram_poll_generation',
  name: 'Ideogram Poll Generation',
  description: 'Poll the status and results of an asynchronous Ideogram generation',
  operation: 'poll_generation',
  params: {
    generationId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Generation ID returned by an async Ideogram generation',
    },
  },
  body: (params) => ({
    generationId: params.generationId,
  }),
  transformOutput: (data) => ({
    generationId: typeof data.generationId === 'string' ? data.generationId : '',
    status: typeof data.status === 'string' ? data.status : '',
    ...transformImagesOutput(data),
  }),
  outputs: {
    generationId: { type: 'string', description: 'Generation ID' },
    status: {
      type: 'string',
      description: 'Generation status: pending, completed, or failed',
    },
    created: { type: 'string', description: 'Creation timestamp', optional: true },
    content: { type: 'string', description: 'Primary persisted image URL', optional: true },
    image: {
      type: 'file',
      description: 'Primary generated image file when completed',
      optional: true,
    },
    imageUrl: { type: 'string', description: 'Primary persisted image URL', optional: true },
    responseType: {
      type: 'string',
      description: 'Response type when completed',
      optional: true,
    },
    images: {
      type: 'array',
      description: 'Generated images when status is completed',
      items: {
        type: 'object',
        description: 'Ideogram image object',
        properties: {
          url: { type: 'string', description: 'Persisted image URL', optional: true },
          prompt: { type: 'string', description: 'Prompt used', optional: true },
          resolution: { type: 'string', description: 'Resolution', optional: true },
          isImageSafe: { type: 'boolean', description: 'Safety check result' },
          seed: { type: 'number', description: 'Seed', optional: true },
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

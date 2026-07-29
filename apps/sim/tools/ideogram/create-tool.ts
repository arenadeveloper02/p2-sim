import { IMAGE_GENERATION_PROVIDER_TIMEOUT_MS } from '@/lib/image-generation/constants'
import type { IdeogramOperation } from '@/tools/ideogram/constants'
import type { ToolConfig, ToolResponse } from '@/tools/types'

interface CreateIdeogramToolOptions<P extends Record<string, unknown>, R extends ToolResponse> {
  id: string
  name: string
  description: string
  operation: IdeogramOperation
  params: ToolConfig<P, R>['params']
  body: (params: P) => Record<string, unknown>
  transformOutput: (data: Record<string, unknown>) => R['output']
  outputs: NonNullable<ToolConfig<P, R>['outputs']>
}

/** Shared file param for tools that accept a single image upload. Pair with {@link ideogramImageUrlParam}. */
export const ideogramImageFileParam = {
  type: 'file' as const,
  required: false,
  visibility: 'user-or-llm' as const,
  description:
    'Image file (JPEG, PNG, or WebP, max 10MB). Provide this or imageUrl — not both required.',
}

/** Shared URL param for tools that accept a single public image URL. Pair with {@link ideogramImageFileParam}. */
export const ideogramImageUrlParam = {
  type: 'string' as const,
  required: false,
  visibility: 'user-or-llm' as const,
  description:
    'HTTPS URL of a publicly accessible image. Use when not uploading a file (provide image or imageUrl).',
}

/** Shared mask file param for inpaint. Pair with {@link ideogramMaskUrlParam}. */
export const ideogramMaskFileParam = {
  type: 'file' as const,
  required: false,
  visibility: 'user-or-llm' as const,
  description:
    'Black-and-white mask file matching the image size. Provide this or maskUrl.',
}

/** Shared mask URL param for inpaint. Pair with {@link ideogramMaskFileParam}. */
export const ideogramMaskUrlParam = {
  type: 'string' as const,
  required: false,
  visibility: 'user-or-llm' as const,
  description:
    'HTTPS URL of a publicly accessible mask image. Use when not uploading a mask file.',
}

/**
 * Creates an Ideogram tool that routes through the internal multipart/JSON proxy.
 */
export function createIdeogramProxyTool<
  P extends Record<string, unknown> & { apiKey?: string },
  R extends ToolResponse,
>(options: CreateIdeogramToolOptions<P, R>): ToolConfig<P, R> {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    version: '1.0.0',
    params: {
      apiKey: {
        type: 'string',
        required: false,
        visibility: 'user-only',
        description:
          'Ideogram API key. Optional when IDEOGRAM_API_KEY is set on the server.',
      },
      ...options.params,
    },
    request: {
      url: '/api/tools/ideogram',
      method: 'POST',
      timeout: IMAGE_GENERATION_PROVIDER_TIMEOUT_MS,
      headers: () => ({ 'Content-Type': 'application/json' }),
      body: (params) => ({
        ...(typeof params.apiKey === 'string' && params.apiKey.trim().length > 0
          ? { apiKey: params.apiKey }
          : {}),
        operation: options.operation,
        ...options.body(params),
      }),
    },
    transformResponse: async (response: Response) => {
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok || data.success === false) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Ideogram ${options.operation} failed`
        )
      }

      const outputPayload =
        isRecord(data.output) ? data.output : (data as Record<string, unknown>)

      return {
        success: true,
        output: options.transformOutput(outputPayload),
      } as R
    },
    outputs: options.outputs,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Shared output schema for image-producing Ideogram tools. */
export const ideogramImagesOutputs = {
  created: { type: 'string' as const, description: 'Request creation timestamp', optional: true },
  content: {
    type: 'string' as const,
    description: 'Primary persisted image URL',
    optional: true,
  },
  image: {
    type: 'file' as const,
    description: 'Primary generated image file (persisted to storage)',
    optional: true,
  },
  imageUrl: {
    type: 'string' as const,
    description: 'Primary persisted image URL',
    optional: true,
  },
  images: {
    type: 'array' as const,
    description: 'Generated or edited images',
    items: {
      type: 'object' as const,
      description: 'Ideogram image object',
      properties: {
        url: { type: 'string' as const, description: 'Persisted image URL', optional: true },
        prompt: { type: 'string' as const, description: 'Prompt used for the image', optional: true },
        resolution: { type: 'string' as const, description: 'Image resolution', optional: true },
        upscaledResolution: {
          type: 'string' as const,
          description: 'Upscaled resolution when applicable',
          optional: true,
        },
        isImageSafe: { type: 'boolean' as const, description: 'Whether the image passed safety checks' },
        seed: { type: 'number' as const, description: 'Seed used for generation', optional: true },
        styleType: { type: 'string' as const, description: 'Style type used', optional: true },
      },
    },
  },
  imageUrls: {
    type: 'array' as const,
    description: 'Non-null persisted image URLs from the response',
    items: { type: 'string' as const, description: 'Image URL' },
  },
  responseType: {
    type: 'string' as const,
    description: 'Response type discriminator when present',
    optional: true,
  },
  s3UploadFailed: {
    type: 'boolean' as const,
    description: 'True when image was saved locally because S3 upload failed',
    optional: true,
  },
}

/**
 * Maps a proxy image-generation payload into the shared images output.
 */
export function transformImagesOutput(data: Record<string, unknown>) {
  const imageUrls = Array.isArray(data.imageUrls)
    ? data.imageUrls.filter((url): url is string => typeof url === 'string')
    : []
  const primaryUrl =
    (typeof data.imageUrl === 'string' && data.imageUrl) ||
    (typeof data.content === 'string' && data.content) ||
    imageUrls[0] ||
    ''

  return {
    created: typeof data.created === 'string' ? data.created : null,
    images: Array.isArray(data.images) ? data.images : [],
    imageUrls,
    content: primaryUrl,
    image: data.image ?? primaryUrl,
    imageUrl: primaryUrl,
    responseType: typeof data.responseType === 'string' ? data.responseType : null,
    ...(data.s3UploadFailed === true ? { s3UploadFailed: true } : {}),
  }
}

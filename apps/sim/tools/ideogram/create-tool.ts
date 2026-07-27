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
  images: {
    type: 'array' as const,
    description: 'Generated or edited images',
    items: {
      type: 'object' as const,
      description: 'Ideogram image object',
      properties: {
        url: { type: 'string' as const, description: 'Temporary image URL', optional: true },
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
    description: 'Non-null image URLs from the response',
    items: { type: 'string' as const, description: 'Image URL' },
  },
  responseType: {
    type: 'string' as const,
    description: 'Response type discriminator when present',
    optional: true,
  },
}

/**
 * Maps a proxy image-generation payload into the shared images output.
 */
export function transformImagesOutput(data: Record<string, unknown>) {
  return {
    created: typeof data.created === 'string' ? data.created : null,
    images: Array.isArray(data.images) ? data.images : [],
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
    responseType: typeof data.responseType === 'string' ? data.responseType : null,
  }
}

import {
  IMAGE_GENERATION_PROVIDER_TIMEOUT_MS,
  MAX_IMAGES_TO_GENERATE,
} from '@/lib/image-generation/constants'
import { sanitizeImageGenerationWrapperParams } from '@/lib/image-generation/nano-banana-inputs'
import { runImageGenerationWrapper } from '@/lib/image-generation/run-wrapper.server'
import type {
  ImageGenerationWrapperParams,
  ImageGenerationWrapperResponse,
} from '@/tools/image_generation/types'
import type { ToolConfig } from '@/tools/types'

interface CreateImageGenerationWrapperToolArgs {
  baseTool: ToolConfig
  baseToolId: string
  id: string
  name: string
}

function buildWrapperOutputs(
  baseOutputs: ToolConfig['outputs']
): NonNullable<ToolConfig['outputs']> {
  const metadataOutput = baseOutputs?.metadata
  const metadataProperties =
    metadataOutput && 'properties' in metadataOutput && metadataOutput.properties
      ? metadataOutput.properties
      : undefined

  return {
    ...(baseOutputs ?? {}),
    content: baseOutputs?.content ?? {
      type: 'string',
      description: 'Primary generated image URL or identifier',
    },
    image: {
      ...(baseOutputs?.image ?? {
        type: 'file',
        description: 'Primary generated image',
      }),
      type: 'file',
    },
    images: {
      type: 'array',
      description: 'All generated images for this request',
      items: { type: 'file', description: 'Generated image' },
    },
    metadata: {
      ...(metadataOutput ?? {
        type: 'json',
        description: 'Image generation metadata',
      }),
      properties: {
        ...(metadataProperties ?? {}),
        count: { type: 'number', description: 'Total number of generated images returned' },
        warnings: {
          type: 'array',
          description: 'Warnings emitted while preparing or generating the image request',
          items: { type: 'string', description: 'Warning message' },
        },
        s3UploadFailed: {
          type: 'boolean',
          description: 'Whether any generated image failed to upload to storage',
        },
      },
    },
  }
}

export function createImageGenerationWrapperTool(
  args: CreateImageGenerationWrapperToolArgs
): ToolConfig<ImageGenerationWrapperParams, ImageGenerationWrapperResponse> {
  const { baseTool, baseToolId, id, name } = args

  return {
    ...baseTool,
    id,
    name,
    version: '2.0.0',
    params: {
      ...baseTool.params,
      imageCount: {
        type: 'number',
        required: false,
        visibility: 'hidden',
        description: `Requested images to generate (1-${MAX_IMAGES_TO_GENERATE})`,
      },
      inputImageWarning: {
        type: 'string',
        required: false,
        visibility: 'hidden',
        description:
          'Warning emitted when multiple input images were provided and the latest one was used',
      },
    },
    outputs: buildWrapperOutputs(baseTool.outputs),
    request: {
      url: '/api/tools/image-generation',
      method: 'POST',
      timeout: IMAGE_GENERATION_PROVIDER_TIMEOUT_MS,
      headers: () => ({
        'Content-Type': 'application/json',
      }),
      body: (params) => {
        return {
          baseToolId,
          params: sanitizeImageGenerationWrapperParams(params as Record<string, unknown>),
        }
      },
    },
    postProcess: undefined,
    directExecution: async (params) => {
      const result = await runImageGenerationWrapper({
        baseToolId: baseToolId as 'openai_image' | 'google_imagen' | 'google_nano_banana',
        params: sanitizeImageGenerationWrapperParams(params as Record<string, unknown>),
      })

      if (!result.success) {
        return {
          success: false,
          output: {},
          error: result.error,
        }
      }

      return {
        success: true,
        output: result.output,
      }
    },
    transformResponse: async (response) => {
      return (await response.json()) as ImageGenerationWrapperResponse
    },
  }
}

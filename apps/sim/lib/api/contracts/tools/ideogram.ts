import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { FileInputSchema } from '@/lib/uploads/utils/file-schemas'
import { IDEOGRAM_OPERATIONS, RESOLUTION_V3_OPTIONS } from '@/tools/ideogram/constants'

const resolutionV3Schema = z.enum(RESOLUTION_V3_OPTIONS)

const fileOrFilesSchema = z.union([FileInputSchema, z.array(FileInputSchema)])

/**
 * Internal Ideogram proxy body. Tools send camelCase fields; the route maps
 * them onto Ideogram multipart/JSON payloads and returns camelCase outputs.
 */
export const ideogramProxyBodySchema = z
  .object({
    apiKey: z.string().min(1, 'Ideogram API key cannot be empty').optional(),
    operation: z.enum(IDEOGRAM_OPERATIONS),
    webhookUrl: z.string().url().optional(),
    generationId: z.string().min(1).optional(),
    textPrompt: z.string().optional(),
    prompt: z.string().optional(),
    jsonPrompt: z.unknown().optional(),
    resolution: z.string().optional(),
    renderingSpeed: z.string().optional(),
    enableCopyrightDetection: z.boolean().optional().nullable(),
    useMagicPrompt: z.boolean().optional().nullable(),
    imageWeight: z.number().optional(),
    aspectRatio: z.string().optional(),
    includeBbox: z.boolean().optional(),
    seed: z.number().optional(),
    magicPrompt: z.string().optional(),
    magicPromptOption: z.string().optional(),
    negativePrompt: z.string().optional(),
    numImages: z.number().optional(),
    styleType: z.string().optional(),
    stylePreset: z.string().optional(),
    colorPalette: z.unknown().optional(),
    styleCodes: z.unknown().optional(),
    customModelUri: z.string().optional(),
    upscaleFactor: z.string().optional(),
    resemblance: z.number().optional(),
    detail: z.number().optional(),
    transparentBackground: z.boolean().optional(),
    describeModelVersion: z.string().optional(),
    imageUrls: z.unknown().optional(),
    image: FileInputSchema.optional().nullable(),
    mask: FileInputSchema.optional().nullable(),
    images: fileOrFilesSchema.optional().nullable(),
    styleReferenceImages: fileOrFilesSchema.optional().nullable(),
    characterReferenceImages: fileOrFilesSchema.optional().nullable(),
    characterReferenceImagesMask: fileOrFilesSchema.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.operation === 'reframe_v3') {
      if (!value.resolution) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resolution'],
          message: 'resolution is required for Reframe',
        })
        return
      }
      const parsed = resolutionV3Schema.safeParse(value.resolution)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resolution'],
          message: 'resolution must be a valid Ideogram ResolutionV3 value',
        })
      }
    }
  })

export type IdeogramProxyBody = z.input<typeof ideogramProxyBodySchema>

const ideogramImageObjectSchema = z.object({
  url: z.string().nullable(),
  prompt: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  upscaledResolution: z.string().nullable().optional(),
  isImageSafe: z.boolean(),
  seed: z.number().nullable().optional(),
  styleType: z.string().nullable().optional(),
})

const ideogramProxyResponseSchema = z.object({
  success: z.boolean(),
  output: z
    .object({
      created: z.string().nullable().optional(),
      images: z.array(ideogramImageObjectSchema).optional(),
      imageUrls: z.array(z.string()).optional(),
      content: z.string().optional(),
      image: z.unknown().optional(),
      imageUrl: z.string().optional(),
      imageFiles: z.array(z.unknown()).optional(),
      s3UploadFailed: z.boolean().optional(),
      responseType: z.string().nullable().optional(),
      generationId: z.string().optional(),
      status: z.string().optional(),
      jsonPrompt: z.unknown().optional(),
      aspectRatio: z.string().optional(),
      descriptions: z
        .array(z.object({ text: z.string().nullable() }))
        .optional(),
      baseImageUrl: z.string().optional(),
      originalImageUrl: z.string().nullable().optional(),
      seed: z.number().optional(),
      textBlocks: z.array(z.unknown()).optional(),
      magicPromptUsed: z.boolean().optional(),
    })
    .optional(),
  error: z.string().optional(),
})

export type IdeogramProxyResponse = z.output<typeof ideogramProxyResponseSchema>

export const ideogramProxyContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/ideogram',
  body: ideogramProxyBodySchema,
  response: { mode: 'json', schema: ideogramProxyResponseSchema },
})

const POST_PROCESSOR_OPERATIONS = [
  'describe_v4',
  'layerize_text',
  'reframe_v3',
  'remove_background',
  'upscale',
] as const

/**
 * Session-auth body for interactive image post-processing from chat overlays.
 */
export const ideogramPostProcessBodySchema = z
  .object({
    operation: z.enum(POST_PROCESSOR_OPERATIONS),
    imageUrl: z.string().min(1, 'imageUrl is required'),
    workflowId: z.string().min(1).optional(),
    resolution: z.string().min(1).optional(),
    includeBbox: z.boolean().optional(),
    prompt: z.string().optional(),
    seed: z.number().optional(),
    apiKey: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.operation === 'reframe_v3') {
      if (!value.resolution) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resolution'],
          message: 'resolution is required for Reframe',
        })
        return
      }
      const parsed = resolutionV3Schema.safeParse(value.resolution)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resolution'],
          message: `resolution must be a valid Ideogram ResolutionV3 value`,
        })
      }
    }
  })

export type IdeogramPostProcessBody = z.input<typeof ideogramPostProcessBodySchema>
export type IdeogramPostProcessResponse = z.output<typeof ideogramProxyResponseSchema>

export const ideogramPostProcessContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/ideogram/post-process',
  body: ideogramPostProcessBodySchema,
  response: { mode: 'json', schema: ideogramProxyResponseSchema },
})

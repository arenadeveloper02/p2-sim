import type { SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput } from '@/blocks/utils'
import { extractStorageKey, isInternalFileUrl } from '@/lib/uploads/utils/file-utils'
import { RENDERING_SPEED_OPTIONS } from '@/tools/ideogram/constants'

/** Ideogram post-process operations for the Post Processor block and image ⋯ menu. */
export const IDEOGRAM_POST_PROCESSOR_OPERATIONS = [
  'describe_v4',
  'layerize_text',
  'reframe_v3',
  'remove_background',
  'upscale',
] as const

export type IdeogramPostProcessorOperation =
  (typeof IDEOGRAM_POST_PROCESSOR_OPERATIONS)[number]

export const IDEOGRAM_POST_PROCESSOR_TOOL_IDS = IDEOGRAM_POST_PROCESSOR_OPERATIONS.map(
  (operation) => `ideogram_${operation}` as const
)

export const IDEOGRAM_POST_PROCESSOR_OPERATION_OPTIONS = [
  { label: 'Describe', id: 'describe_v4' },
  { label: 'Layerize Text', id: 'layerize_text' },
  { label: 'Reframe', id: 'reframe_v3' },
  { label: 'Remove Background', id: 'remove_background' },
  { label: 'Upscale', id: 'upscale' },
] as const

/**
 * Curated ResolutionV3 values for the block and per-image ⋯ Reframe menu.
 * Must stay within Ideogram's ResolutionV3 enum (see RESOLUTION_V3_OPTIONS).
 */
export const POST_PROCESSOR_REFRAME_RESOLUTION_OPTIONS = [
  { label: 'Square (1024×1024)', id: '1024x1024' },
  { label: 'Portrait (640×1536)', id: '640x1536' },
  { label: 'Portrait (832×1248)', id: '832x1248' },
  { label: 'Portrait (736×1312)', id: '736x1312' },
  { label: 'Landscape (1536×640)', id: '1536x640' },
  { label: 'Landscape (1344×768)', id: '1344x768' },
  { label: 'Landscape (1280×800)', id: '1280x800' },
] as const

/**
 * Coerces a bare internal image URL string into a FileInput-shaped object.
 * External URLs are left unchanged (normalizeFileInput / FileInputSchema reject them).
 */
export function coercePostProcessorImageInput(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value

  if (isInternalFileUrl(trimmed)) {
    const key = extractStorageKey(trimmed)
    const name = key.split('/').pop() || 'image.png'
    return { url: trimmed, name, size: 0, key }
  }

  try {
    JSON.parse(trimmed)
    return value
  } catch {
    return value
  }
}

function postOp(
  operation: string | readonly string[]
): NonNullable<SubBlockConfig['condition']> {
  return { field: 'operation', value: operation as string | string[] }
}

/**
 * SubBlocks for the Image Post Processor block.
 */
export const IDEOGRAM_POST_PROCESSOR_SUB_BLOCKS: SubBlockConfig[] = [
  {
    id: 'operation',
    title: 'Operation',
    type: 'dropdown',
    required: true,
    options: [...IDEOGRAM_POST_PROCESSOR_OPERATION_OPTIONS],
    value: () => 'remove_background',
  },
  {
    id: 'apiKey',
    title: 'Ideogram API Key',
    type: 'short-input',
    placeholder: 'Enter your Ideogram API key',
    password: true,
    required: false,
    hideWhenHosted: true,
  },
  {
    id: 'uploadImage',
    title: 'Image',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: false,
    canonicalParamId: 'image',
    mode: 'basic',
    required: false,
  },
  {
    id: 'imageRef',
    title: 'Image',
    type: 'short-input',
    placeholder: 'File reference from a previous block',
    canonicalParamId: 'image',
    mode: 'advanced',
    required: false,
  },
  {
    id: 'imageUrl',
    title: 'Image URL (alternative)',
    type: 'short-input',
    placeholder: 'Publicly accessible image URL (use if not uploading a file)',
    required: false,
  },
  {
    id: 'resolution',
    title: 'Resolution',
    type: 'dropdown',
    options: [...POST_PROCESSOR_REFRAME_RESOLUTION_OPTIONS],
    required: { field: 'operation', value: 'reframe_v3' },
    condition: postOp('reframe_v3'),
    dependsOn: ['operation'],
  },
  {
    id: 'renderingSpeed',
    title: 'Rendering Speed',
    type: 'dropdown',
    options: RENDERING_SPEED_OPTIONS.map((id) => ({ label: id, id })),
    clearable: true,
    value: () => '',
    condition: postOp('reframe_v3'),
    dependsOn: ['operation'],
  },
  {
    id: 'includeBbox',
    title: 'Include Bounding Boxes',
    type: 'switch',
    defaultValue: true,
    condition: postOp('describe_v4'),
    dependsOn: ['operation'],
  },
  {
    id: 'prompt',
    title: 'Prompt',
    type: 'long-input',
    placeholder: 'Optional guidance for layerize or upscale…',
    mode: 'advanced',
    condition: postOp(['layerize_text', 'upscale']),
    dependsOn: ['operation'],
  },
  {
    id: 'seed',
    title: 'Seed',
    type: 'short-input',
    placeholder: 'Optional seed',
    mode: 'advanced',
    condition: postOp(['layerize_text', 'reframe_v3', 'upscale']),
    dependsOn: ['operation'],
  },
]

/**
 * Resolves the Ideogram tool ID for the Post Processor block.
 */
export function resolvePostProcessorToolId(params: Record<string, unknown>): string {
  const rawImage = coercePostProcessorImageInput(
    params.uploadImage || params.imageRef || params.image
  )
  const image = normalizeFileInput(rawImage, { single: true })
  if (image) {
    params.image = image
  } else if (typeof params.imageUrl === 'string' && params.imageUrl.trim().length > 0) {
    params.imageUrl = params.imageUrl.trim()
  } else if (typeof rawImage === 'string' && rawImage.trim().length > 0) {
    // External URL left as a string by coercePostProcessorImageInput
    params.imageUrl = rawImage.trim()
  }

  const operation =
    typeof params.operation === 'string' && params.operation.trim().length > 0
      ? params.operation.trim()
      : 'remove_background'

  return `ideogram_${operation}`
}

/**
 * Maps Post Processor block params to Ideogram tool params.
 */
export function buildPostProcessorToolParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const toNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined
    const num = Number(value)
    return Number.isFinite(num) ? num : undefined
  }

  const imageUrl =
    typeof params.imageUrl === 'string' && params.imageUrl.trim().length > 0
      ? params.imageUrl.trim()
      : undefined

  return {
    ...(typeof params.apiKey === 'string' && params.apiKey.trim().length > 0
      ? { apiKey: params.apiKey }
      : {}),
    image: params.image,
    ...(imageUrl && !params.image ? { imageUrl } : {}),
    resolution: params.resolution,
    renderingSpeed: params.renderingSpeed,
    includeBbox: params.includeBbox,
    prompt: params.prompt,
    seed: toNumber(params.seed),
  }
}

import type { SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput } from '@/blocks/utils'
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

/** Curated reframe resolutions for the block and per-image ⋯ menu. */
export const POST_PROCESSOR_REFRAME_RESOLUTION_OPTIONS = [
  { label: 'Square (1024×1024)', id: '1024x1024' },
  { label: 'Landscape (1536×1024)', id: '1536x1024' },
  { label: 'Portrait (1024×1536)', id: '1024x1536' },
  { label: 'HD Landscape (1920×1080)', id: '1920x1080' },
  { label: '2K Landscape (2560×1440)', id: '2560x1440' },
  { label: '2K Portrait (1440×2560)', id: '1440x2560' },
] as const

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
    required: true,
  },
  {
    id: 'imageRef',
    title: 'Image',
    type: 'short-input',
    placeholder: 'Reference image from a previous block',
    canonicalParamId: 'image',
    mode: 'advanced',
    required: true,
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
  const image = normalizeFileInput(params.uploadImage || params.imageRef || params.image, {
    single: true,
  })
  if (image) params.image = image

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

  return {
    ...(typeof params.apiKey === 'string' && params.apiKey.trim().length > 0
      ? { apiKey: params.apiKey }
      : {}),
    image: params.image,
    resolution: params.resolution,
    renderingSpeed: params.renderingSpeed,
    includeBbox: params.includeBbox,
    prompt: params.prompt,
    seed: toNumber(params.seed),
  }
}

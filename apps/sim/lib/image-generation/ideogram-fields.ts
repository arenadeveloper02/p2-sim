import type { SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput, parseOptionalBooleanInput } from '@/blocks/utils'
import {
  RENDERING_SPEED_OPTIONS,
  RESOLUTION_V4_OPTIONS,
  STYLE_TYPE_V3_OPTIONS,
  UPSCALE_FACTOR_OPTIONS,
} from '@/tools/ideogram/constants'

/** Ideogram create/edit operations shown on Image Generator. */
export const IDEOGRAM_GENERATOR_OPERATIONS = [
  'generate_v4',
  'remix_v4',
  'edit',
  'inpaint_v3',
  'generate_transparent_v3',
] as const

export type IdeogramGeneratorOperation = (typeof IDEOGRAM_GENERATOR_OPERATIONS)[number]

export const IDEOGRAM_GENERATOR_TOOL_IDS = IDEOGRAM_GENERATOR_OPERATIONS.map(
  (operation) => `ideogram_${operation}` as const
)

const IMAGE_OPS = ['remix_v4', 'inpaint_v3'] as const
const PROMPT_OPS = ['generate_transparent_v3', 'inpaint_v3', 'edit'] as const
const TEXT_PROMPT_OPS = ['generate_v4', 'remix_v4'] as const
const RESOLUTION_V4_OPS = ['generate_v4', 'remix_v4'] as const
const RENDERING_SPEED_OPS = [
  'generate_v4',
  'remix_v4',
  'generate_transparent_v3',
  'inpaint_v3',
] as const

function toDropdownOptions(values: readonly string[]) {
  return values.map((id) => ({ label: id, id }))
}

function ideogramOp(
  operation: string | readonly string[]
): NonNullable<SubBlockConfig['condition']> {
  return {
    field: 'provider',
    value: 'ideogram',
    and: { field: 'operation', value: operation as string | string[] },
  }
}

export const IDEOGRAM_OPERATION_OPTIONS = [
  { label: 'Generate 4.0', id: 'generate_v4' },
  { label: 'Remix 4.0', id: 'remix_v4' },
  { label: 'Edit with Prompt', id: 'edit' },
  { label: 'Inpaint 3.0', id: 'inpaint_v3' },
  { label: 'Generate Transparent 3.0', id: 'generate_transparent_v3' },
] as const

/** @deprecated Use IDEOGRAM_GENERATOR_TOOL_IDS — kept for Image Generator access list. */
export const IDEOGRAM_TOOL_IDS = IDEOGRAM_GENERATOR_TOOL_IDS

/**
 * Ideogram-specific Image Generator subBlocks. Shown only when provider is ideogram.
 */
export const IDEOGRAM_IMAGE_GENERATOR_SUB_BLOCKS: SubBlockConfig[] = [
  {
    id: 'operation',
    title: 'Operation',
    type: 'dropdown',
    required: true,
    options: [...IDEOGRAM_OPERATION_OPTIONS],
    value: () => 'generate_v4',
    condition: { field: 'provider', value: 'ideogram' },
    dependsOn: ['provider'],
  },
  {
    id: 'apiKey',
    title: 'Ideogram API Key',
    type: 'short-input',
    placeholder: 'Enter your Ideogram API key',
    password: true,
    required: false,
    hideWhenHosted: true,
    condition: { field: 'provider', value: 'ideogram' },
    dependsOn: ['provider'],
  },
  {
    id: 'textPrompt',
    title: 'Text Prompt',
    type: 'long-input',
    placeholder: 'Describe the image to generate…',
    required: { field: 'operation', value: 'remix_v4' },
    condition: ideogramOp(TEXT_PROMPT_OPS),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'useMagicPrompt',
    title: 'Magic Prompt',
    type: 'switch',
    tooltip:
      'Rewrites your text prompt into Ideogram’s structured JSON prompt format for stronger composition and typography results.',
    condition: ideogramOp('generate_v4'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'jsonPrompt',
    title: 'JSON Prompt',
    type: 'code',
    language: 'json',
    placeholder:
      '{ "high_level_description": "...", "compositional_deconstruction": { ... } }',
    mode: 'advanced',
    condition: ideogramOp('generate_v4'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'ideogramPrompt',
    title: 'Prompt',
    type: 'long-input',
    placeholder: 'Describe the desired image or edit…',
    required: {
      field: 'operation',
      value: ['generate_transparent_v3', 'inpaint_v3', 'edit'],
    },
    condition: ideogramOp(PROMPT_OPS),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'uploadImage',
    title: 'Image',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: false,
    canonicalParamId: 'image',
    mode: 'basic',
    required: { field: 'operation', value: [...IMAGE_OPS] },
    condition: ideogramOp(IMAGE_OPS),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'imageRef',
    title: 'Image',
    type: 'short-input',
    placeholder: 'Reference image from a previous block',
    canonicalParamId: 'image',
    mode: 'advanced',
    required: { field: 'operation', value: [...IMAGE_OPS] },
    condition: ideogramOp(IMAGE_OPS),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'uploadMask',
    title: 'Mask',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: false,
    canonicalParamId: 'mask',
    mode: 'basic',
    required: { field: 'operation', value: 'inpaint_v3' },
    condition: ideogramOp('inpaint_v3'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'maskRef',
    title: 'Mask',
    type: 'short-input',
    placeholder: 'Reference mask from a previous block',
    canonicalParamId: 'mask',
    mode: 'advanced',
    required: { field: 'operation', value: 'inpaint_v3' },
    condition: ideogramOp('inpaint_v3'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'uploadImages',
    title: 'Images',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: true,
    canonicalParamId: 'images',
    mode: 'basic',
    condition: ideogramOp('edit'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'imagesRef',
    title: 'Images',
    type: 'short-input',
    placeholder: 'Reference images from a previous block',
    canonicalParamId: 'images',
    mode: 'advanced',
    condition: ideogramOp('edit'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'imageUrls',
    title: 'Image URLs',
    type: 'code',
    language: 'json',
    placeholder: '["https://ideogram.ai/api/images/..."]',
    mode: 'advanced',
    condition: ideogramOp('edit'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'resolutionV4',
    title: 'Resolution',
    type: 'dropdown',
    options: toDropdownOptions(RESOLUTION_V4_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp(RESOLUTION_V4_OPS),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'ideogramResolution',
    title: 'Resolution',
    type: 'short-input',
    placeholder: 'e.g. 1024x1024',
    condition: ideogramOp('edit'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'ideogramAspectRatio',
    title: 'Aspect Ratio',
    type: 'dropdown',
    options: [
      { label: '1x1', id: '1x1' },
      { label: '16x9', id: '16x9' },
      { label: '9x16', id: '9x16' },
      { label: '4x3', id: '4x3' },
      { label: '3x4', id: '3x4' },
    ],
    clearable: true,
    value: () => '',
    condition: ideogramOp(['generate_transparent_v3', 'edit']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'renderingSpeed',
    title: 'Rendering Speed',
    type: 'dropdown',
    options: toDropdownOptions(RENDERING_SPEED_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp(RENDERING_SPEED_OPS),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'styleType',
    title: 'Style Type',
    type: 'dropdown',
    options: toDropdownOptions(STYLE_TYPE_V3_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp('inpaint_v3'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'upscaleFactor',
    title: 'Upscale Factor',
    type: 'dropdown',
    options: toDropdownOptions(UPSCALE_FACTOR_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp('generate_transparent_v3'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'transparentBackground',
    title: 'Transparent Background',
    type: 'switch',
    condition: ideogramOp('edit'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'imageWeight',
    title: 'Image Weight',
    type: 'short-input',
    placeholder: '50',
    mode: 'advanced',
    condition: ideogramOp('remix_v4'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'enableCopyrightDetection',
    title: 'Copyright Detection',
    type: 'switch',
    mode: 'advanced',
    condition: ideogramOp(['generate_v4', 'remix_v4']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'numImages',
    title: 'Number of Images',
    type: 'short-input',
    placeholder: '1',
    mode: 'advanced',
    condition: ideogramOp(['generate_transparent_v3', 'inpaint_v3', 'edit']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'seed',
    title: 'Seed',
    type: 'short-input',
    placeholder: 'Optional seed',
    mode: 'advanced',
    condition: ideogramOp(['generate_transparent_v3', 'inpaint_v3', 'edit']),
    dependsOn: ['provider', 'operation'],
  },
]

/**
 * Resolves the Ideogram tool ID for Image Generator when provider is ideogram.
 */
export function resolveIdeogramToolId(params: Record<string, unknown>): string {
  const image = normalizeFileInput(params.uploadImage || params.imageRef || params.image, {
    single: true,
  })
  if (image) params.image = image

  const mask = normalizeFileInput(params.uploadMask || params.maskRef || params.mask, {
    single: true,
  })
  if (mask) params.mask = mask

  const images = normalizeFileInput(params.uploadImages || params.imagesRef || params.images)
  if (images) params.images = images

  const operation =
    typeof params.operation === 'string' && params.operation.trim().length > 0
      ? params.operation.trim()
      : 'generate_v4'

  return `ideogram_${operation}`
}

/**
 * Maps Image Generator params to Ideogram tool params.
 */
export function buildIdeogramToolParams(params: Record<string, unknown>): Record<string, unknown> {
  const toNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined
    const num = Number(value)
    return Number.isFinite(num) ? num : undefined
  }

  return {
    ...(typeof params.apiKey === 'string' && params.apiKey.trim().length > 0
      ? { apiKey: params.apiKey }
      : {}),
    textPrompt: params.textPrompt,
    jsonPrompt: params.jsonPrompt,
    useMagicPrompt: parseOptionalBooleanInput(params.useMagicPrompt),
    prompt: params.ideogramPrompt ?? params.prompt,
    image: params.image,
    mask: params.mask,
    images: params.images,
    imageUrls: params.imageUrls,
    resolution: params.resolutionV4 || params.ideogramResolution || params.resolution,
    aspectRatio: params.ideogramAspectRatio || params.aspectRatio,
    renderingSpeed: params.renderingSpeed,
    styleType: params.styleType,
    upscaleFactor: params.upscaleFactor,
    enableCopyrightDetection: params.enableCopyrightDetection,
    transparentBackground: params.transparentBackground,
    numImages: toNumber(params.numImages),
    seed: toNumber(params.seed),
    imageWeight: toNumber(params.imageWeight),
  }
}

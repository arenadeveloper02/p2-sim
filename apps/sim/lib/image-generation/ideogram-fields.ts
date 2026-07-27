import type { SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput } from '@/blocks/utils'
import {
  ASPECT_RATIO_V3_OPTIONS,
  ASPECT_RATIO_V4_OPTIONS,
  DESCRIBE_MODEL_VERSION_OPTIONS,
  IDEOGRAM_OPERATIONS,
  MAGIC_PROMPT_OPTIONS,
  RENDERING_SPEED_OPTIONS,
  RESOLUTION_V4_OPTIONS,
  STYLE_TYPE_V3_OPTIONS,
  UPSCALE_FACTOR_OPTIONS,
} from '@/tools/ideogram/constants'

const IMAGE_OPS = [
  'remix_v4',
  'describe_v4',
  'inpaint_v3',
  'remix_v3',
  'reframe_v3',
  'replace_background_v3',
  'remove_background',
  'layerize_text',
  'upscale',
  'describe',
] as const

const PROMPT_OPS = [
  'generate_v3',
  'generate_transparent_v3',
  'inpaint_v3',
  'remix_v3',
  'replace_background_v3',
  'edit',
  'upscale',
  'layerize_text',
] as const

const TEXT_PROMPT_OPS = [
  'generate_v4',
  'generate_v4_async',
  'remix_v4',
  'magic_prompt_v4',
] as const

const RESOLUTION_V4_OPS = ['generate_v4', 'generate_v4_async', 'remix_v4'] as const

const RENDERING_SPEED_OPS = [
  'generate_v4',
  'generate_v4_async',
  'remix_v4',
  'generate_v3',
  'generate_transparent_v3',
  'inpaint_v3',
  'remix_v3',
  'reframe_v3',
  'replace_background_v3',
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

export const IDEOGRAM_TOOL_IDS = IDEOGRAM_OPERATIONS.map(
  (operation) => `ideogram_${operation}` as const
)

export const IDEOGRAM_OPERATION_OPTIONS = [
  { label: 'Generate 4.0', id: 'generate_v4' },
  { label: 'Generate 4.0 Async', id: 'generate_v4_async' },
  { label: 'Poll Generation', id: 'poll_generation' },
  { label: 'Remix 4.0', id: 'remix_v4' },
  { label: 'Magic Prompt 4.0', id: 'magic_prompt_v4' },
  { label: 'Describe 4.0', id: 'describe_v4' },
  { label: 'Generate 3.0', id: 'generate_v3' },
  { label: 'Generate Transparent 3.0', id: 'generate_transparent_v3' },
  { label: 'Inpaint 3.0', id: 'inpaint_v3' },
  { label: 'Remix 3.0', id: 'remix_v3' },
  { label: 'Reframe 3.0', id: 'reframe_v3' },
  { label: 'Replace Background 3.0', id: 'replace_background_v3' },
  { label: 'Remove Background', id: 'remove_background' },
  { label: 'Layerize Text', id: 'layerize_text' },
  { label: 'Edit with Prompt', id: 'edit' },
  { label: 'Upscale', id: 'upscale' },
  { label: 'Describe', id: 'describe' },
] as const

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
    id: 'webhookUrl',
    title: 'Webhook URL',
    type: 'short-input',
    placeholder: 'https://example.com/webhook',
    required: { field: 'operation', value: 'generate_v4_async' },
    condition: ideogramOp('generate_v4_async'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'generationId',
    title: 'Generation ID',
    type: 'short-input',
    placeholder: 'Generation ID from async generate',
    required: { field: 'operation', value: 'poll_generation' },
    condition: ideogramOp('poll_generation'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'textPrompt',
    title: 'Text Prompt',
    type: 'long-input',
    placeholder: 'Describe the image to generate…',
    required: { field: 'operation', value: ['remix_v4', 'magic_prompt_v4'] },
    condition: ideogramOp(TEXT_PROMPT_OPS),
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
    condition: ideogramOp(['generate_v4', 'generate_v4_async']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'ideogramPrompt',
    title: 'Prompt',
    type: 'long-input',
    placeholder: 'Describe the desired image or edit…',
    required: {
      field: 'operation',
      value: [
        'generate_v3',
        'generate_transparent_v3',
        'inpaint_v3',
        'remix_v3',
        'replace_background_v3',
        'edit',
      ],
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
    required: { field: 'operation', value: 'reframe_v3' },
    condition: ideogramOp(['generate_v3', 'remix_v3', 'reframe_v3', 'edit']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'aspectRatioV4',
    title: 'Aspect Ratio',
    type: 'dropdown',
    options: toDropdownOptions(ASPECT_RATIO_V4_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp('magic_prompt_v4'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'ideogramAspectRatio',
    title: 'Aspect Ratio',
    type: 'dropdown',
    options: toDropdownOptions(ASPECT_RATIO_V3_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp(['generate_v3', 'generate_transparent_v3', 'remix_v3', 'edit']),
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
    id: 'magicPrompt',
    title: 'Magic Prompt',
    type: 'dropdown',
    options: toDropdownOptions(MAGIC_PROMPT_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp([
      'generate_v3',
      'generate_transparent_v3',
      'inpaint_v3',
      'remix_v3',
      'replace_background_v3',
      'edit',
    ]),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'magicPromptOption',
    title: 'Magic Prompt Option',
    type: 'dropdown',
    options: toDropdownOptions(MAGIC_PROMPT_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp('upscale'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'styleType',
    title: 'Style Type',
    type: 'dropdown',
    options: toDropdownOptions(STYLE_TYPE_V3_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp(['generate_v3', 'inpaint_v3', 'remix_v3']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'stylePreset',
    title: 'Style Preset',
    type: 'short-input',
    placeholder: 'e.g. ART_DECO',
    mode: 'advanced',
    condition: ideogramOp([
      'generate_v3',
      'inpaint_v3',
      'remix_v3',
      'reframe_v3',
      'replace_background_v3',
    ]),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'negativePrompt',
    title: 'Negative Prompt',
    type: 'long-input',
    placeholder: 'What to exclude from the image…',
    mode: 'advanced',
    condition: ideogramOp(['generate_v3', 'generate_transparent_v3', 'remix_v3']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'numImages',
    title: 'Number of Images',
    type: 'short-input',
    placeholder: '1',
    mode: 'advanced',
    condition: ideogramOp([
      'generate_v3',
      'generate_transparent_v3',
      'inpaint_v3',
      'remix_v3',
      'reframe_v3',
      'replace_background_v3',
      'edit',
      'upscale',
    ]),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'seed',
    title: 'Seed',
    type: 'short-input',
    placeholder: 'Optional seed',
    mode: 'advanced',
    condition: ideogramOp([
      'generate_v3',
      'generate_transparent_v3',
      'inpaint_v3',
      'remix_v3',
      'reframe_v3',
      'replace_background_v3',
      'layerize_text',
      'edit',
      'upscale',
    ]),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'imageWeight',
    title: 'Image Weight',
    type: 'short-input',
    placeholder: '50',
    mode: 'advanced',
    condition: ideogramOp(['remix_v4', 'remix_v3']),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'includeBbox',
    title: 'Include Bounding Boxes',
    type: 'switch',
    condition: ideogramOp('describe_v4'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'enableCopyrightDetection',
    title: 'Copyright Detection',
    type: 'switch',
    mode: 'advanced',
    condition: ideogramOp(['generate_v4', 'generate_v4_async', 'remix_v4', 'generate_v3']),
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
    id: 'resemblance',
    title: 'Resemblance',
    type: 'short-input',
    placeholder: '50',
    mode: 'advanced',
    condition: ideogramOp('upscale'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'detail',
    title: 'Detail',
    type: 'short-input',
    placeholder: '50',
    mode: 'advanced',
    condition: ideogramOp('upscale'),
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
    id: 'describeModelVersion',
    title: 'Describe Model Version',
    type: 'dropdown',
    options: toDropdownOptions(DESCRIBE_MODEL_VERSION_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramOp('describe'),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'colorPalette',
    title: 'Color Palette',
    type: 'code',
    language: 'json',
    placeholder: '{ "name": "AUTO" }',
    mode: 'advanced',
    condition: ideogramOp([
      'generate_v3',
      'inpaint_v3',
      'remix_v3',
      'reframe_v3',
      'replace_background_v3',
    ]),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'styleCodes',
    title: 'Style Codes',
    type: 'code',
    language: 'json',
    placeholder: '["ABCD1234"]',
    mode: 'advanced',
    condition: ideogramOp([
      'generate_v3',
      'inpaint_v3',
      'remix_v3',
      'reframe_v3',
      'replace_background_v3',
    ]),
    dependsOn: ['provider', 'operation'],
  },
  {
    id: 'customModelUri',
    title: 'Custom Model URI',
    type: 'short-input',
    placeholder: 'model/<name>/version/<version>',
    mode: 'advanced',
    condition: ideogramOp('generate_v3'),
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
    webhookUrl: params.webhookUrl,
    generationId: params.generationId,
    textPrompt: params.textPrompt,
    jsonPrompt: params.jsonPrompt,
    prompt: params.ideogramPrompt ?? params.prompt,
    image: params.image,
    mask: params.mask,
    images: params.images,
    imageUrls: params.imageUrls,
    resolution: params.resolutionV4 || params.ideogramResolution || params.resolution,
    aspectRatio: params.aspectRatioV4 || params.ideogramAspectRatio || params.aspectRatio,
    renderingSpeed: params.renderingSpeed,
    magicPrompt: params.magicPrompt,
    magicPromptOption: params.magicPromptOption,
    negativePrompt: params.negativePrompt,
    styleType: params.styleType,
    stylePreset: params.stylePreset,
    colorPalette: params.colorPalette,
    styleCodes: params.styleCodes,
    customModelUri: params.customModelUri,
    upscaleFactor: params.upscaleFactor,
    describeModelVersion: params.describeModelVersion,
    includeBbox: params.includeBbox,
    enableCopyrightDetection: params.enableCopyrightDetection,
    transparentBackground: params.transparentBackground,
    numImages: toNumber(params.numImages),
    seed: toNumber(params.seed),
    imageWeight: toNumber(params.imageWeight),
    resemblance: toNumber(params.resemblance),
    detail: toNumber(params.detail),
  }
}

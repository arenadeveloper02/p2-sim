import {
  IDEOGRAM_IMAGE_MODEL_IDS,
  isIdeogramImageModel,
  normalizeImageModelId,
} from '@/lib/image-generation/block-model-config'
import type { SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput, parseOptionalBooleanInput } from '@/blocks/utils'
import {
  RENDERING_SPEED_OPTIONS,
  RESOLUTION_V4_OPTIONS,
  STYLE_TYPE_V3_OPTIONS,
  UPSCALE_FACTOR_OPTIONS,
} from '@/tools/ideogram/constants'

/** Ideogram create/edit model ids shown on Image Generator (also tool suffix). */
export const IDEOGRAM_GENERATOR_MODELS = IDEOGRAM_IMAGE_MODEL_IDS

export type IdeogramGeneratorModel = (typeof IDEOGRAM_GENERATOR_MODELS)[number]

/** @deprecated Use IDEOGRAM_GENERATOR_MODELS — kept for callers that still say "operation". */
export const IDEOGRAM_GENERATOR_OPERATIONS = IDEOGRAM_GENERATOR_MODELS

/** @deprecated Use IdeogramGeneratorModel */
export type IdeogramGeneratorOperation = IdeogramGeneratorModel

export const IDEOGRAM_GENERATOR_TOOL_IDS = IDEOGRAM_GENERATOR_MODELS.map(
  (model) => `ideogram_${model}` as const
)

const IMAGE_MODELS = ['remix_v4', 'inpaint_v3'] as const
const PROMPT_MODELS = ['generate_transparent_v3', 'inpaint_v3', 'edit'] as const
const TEXT_PROMPT_MODELS = ['generate_v4', 'remix_v4'] as const
const RESOLUTION_V4_MODELS = ['generate_v4', 'remix_v4'] as const
const RENDERING_SPEED_MODELS = [
  'generate_v4',
  'remix_v4',
  'generate_transparent_v3',
  'inpaint_v3',
] as const

function toDropdownOptions(values: readonly string[]) {
  return values.map((id) => ({ label: id, id }))
}

function ideogramModel(
  model: string | readonly string[]
): NonNullable<SubBlockConfig['condition']> {
  return {
    field: 'provider',
    value: 'ideogram',
    and: { field: 'model', value: model as string | string[] },
  }
}

/** @deprecated Use IDEOGRAM_IMAGE_MODELS from block-model-config. */
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
 * Ideogram-specific Image Generator subBlocks. Shown when provider is ideogram
 * and the selected model matches. Model selection lives on the shared Model combobox.
 */
export const IDEOGRAM_IMAGE_GENERATOR_SUB_BLOCKS: SubBlockConfig[] = [
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
    required: { field: 'model', value: 'remix_v4' },
    condition: ideogramModel(TEXT_PROMPT_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'useMagicPrompt',
    title: 'Magic Prompt',
    type: 'switch',
    tooltip:
      'Rewrites your text prompt into Ideogram’s structured JSON prompt format for stronger composition and typography results.',
    condition: ideogramModel('generate_v4'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'jsonPrompt',
    title: 'JSON Prompt',
    type: 'code',
    language: 'json',
    placeholder:
      '{ "high_level_description": "...", "compositional_deconstruction": { ... } }',
    mode: 'advanced',
    condition: ideogramModel('generate_v4'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'ideogramPrompt',
    title: 'Prompt',
    type: 'long-input',
    placeholder: 'Describe the desired image or edit…',
    required: {
      field: 'model',
      value: ['generate_transparent_v3', 'inpaint_v3', 'edit'],
    },
    condition: ideogramModel(PROMPT_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'uploadImage',
    title: 'Image',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: false,
    canonicalParamId: 'image',
    mode: 'basic',
    required: { field: 'model', value: [...IMAGE_MODELS] },
    condition: ideogramModel(IMAGE_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'imageRef',
    title: 'Image',
    type: 'short-input',
    placeholder: 'Reference image from a previous block',
    canonicalParamId: 'image',
    mode: 'advanced',
    required: { field: 'model', value: [...IMAGE_MODELS] },
    condition: ideogramModel(IMAGE_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'uploadMask',
    title: 'Mask',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: false,
    canonicalParamId: 'mask',
    mode: 'basic',
    required: { field: 'model', value: 'inpaint_v3' },
    condition: ideogramModel('inpaint_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'maskRef',
    title: 'Mask',
    type: 'short-input',
    placeholder: 'Reference mask from a previous block',
    canonicalParamId: 'mask',
    mode: 'advanced',
    required: { field: 'model', value: 'inpaint_v3' },
    condition: ideogramModel('inpaint_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'uploadImages',
    title: 'Images',
    type: 'file-upload',
    acceptedTypes: 'image/jpeg,image/png,image/webp',
    multiple: true,
    canonicalParamId: 'images',
    mode: 'basic',
    condition: ideogramModel('edit'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'imagesRef',
    title: 'Images',
    type: 'short-input',
    placeholder: 'Reference images from a previous block',
    canonicalParamId: 'images',
    mode: 'advanced',
    condition: ideogramModel('edit'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'imageUrls',
    title: 'Image URLs',
    type: 'code',
    language: 'json',
    placeholder: '["https://ideogram.ai/api/images/..."]',
    mode: 'advanced',
    condition: ideogramModel('edit'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'resolutionV4',
    title: 'Resolution',
    type: 'dropdown',
    options: toDropdownOptions(RESOLUTION_V4_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramModel(RESOLUTION_V4_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'ideogramResolution',
    title: 'Resolution',
    type: 'short-input',
    placeholder: 'e.g. 1024x1024',
    condition: ideogramModel('edit'),
    dependsOn: ['provider', 'model'],
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
    condition: ideogramModel(['generate_transparent_v3', 'edit']),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'renderingSpeed',
    title: 'Rendering Speed',
    type: 'dropdown',
    options: toDropdownOptions(RENDERING_SPEED_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramModel(RENDERING_SPEED_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'styleType',
    title: 'Style Type',
    type: 'dropdown',
    options: toDropdownOptions(STYLE_TYPE_V3_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramModel('inpaint_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'upscaleFactor',
    title: 'Upscale Factor',
    type: 'dropdown',
    options: toDropdownOptions(UPSCALE_FACTOR_OPTIONS),
    clearable: true,
    value: () => '',
    condition: ideogramModel('generate_transparent_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'transparentBackground',
    title: 'Transparent Background',
    type: 'switch',
    condition: ideogramModel('edit'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'imageWeight',
    title: 'Image Weight',
    type: 'short-input',
    placeholder: '50',
    mode: 'advanced',
    condition: ideogramModel('remix_v4'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'enableCopyrightDetection',
    title: 'Copyright Detection',
    type: 'switch',
    mode: 'advanced',
    condition: ideogramModel(['generate_v4', 'remix_v4']),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'numImages',
    title: 'Number of Images',
    type: 'short-input',
    placeholder: '1',
    mode: 'advanced',
    condition: ideogramModel(['generate_transparent_v3', 'inpaint_v3', 'edit']),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'seed',
    title: 'Seed',
    type: 'short-input',
    placeholder: 'Optional seed',
    mode: 'advanced',
    condition: ideogramModel(['generate_transparent_v3', 'inpaint_v3', 'edit']),
    dependsOn: ['provider', 'model'],
  },
]

/**
 * True when Image Generator params should route to an Ideogram tool.
 */
export function isIdeogramGeneratorParams(params: Record<string, unknown>): boolean {
  if (params.provider === 'ideogram') return true

  const model =
    typeof params.model === 'string' ? normalizeImageModelId(params.model) : undefined
  if (isIdeogramImageModel(model)) return true

  // Legacy workflows stored the Ideogram model under `operation`
  if (
    typeof params.operation === 'string' &&
    (IDEOGRAM_GENERATOR_MODELS as readonly string[]).includes(params.operation.trim())
  ) {
    return true
  }

  return false
}

/**
 * Resolves the Ideogram tool ID for Image Generator when provider/model is Ideogram.
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

  const fromModel =
    typeof params.model === 'string' && params.model.trim().length > 0
      ? params.model.trim()
      : ''
  const fromOperation =
    typeof params.operation === 'string' && params.operation.trim().length > 0
      ? params.operation.trim()
      : ''
  const candidate = fromModel || fromOperation || 'generate_v4'
  const modelId = (IDEOGRAM_GENERATOR_MODELS as readonly string[]).includes(candidate)
    ? candidate
    : 'generate_v4'

  return `ideogram_${modelId}`
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

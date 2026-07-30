import {
  IDEOGRAM_IMAGE_MODEL_IDS,
  IDEOGRAM_RESOLVABLE_IMAGE_MODEL_IDS,
  isIdeogramImageModel,
  normalizeImageModelId,
} from '@/lib/image-generation/block-model-config'
import type { SubBlockCondition } from '@/lib/workflows/subblocks/visibility'
import type { SubBlockConfig } from '@/blocks/types'
import { normalizeFileInput, parseOptionalBooleanInput } from '@/blocks/utils'
import {
  RENDERING_SPEED_OPTIONS,
  RESOLUTION_V4_OPTIONS,
  STYLE_TYPE_V3_OPTIONS,
  UPSCALE_FACTOR_OPTIONS,
} from '@/tools/ideogram/constants'

/** Ideogram picker model ids shown on Image Generator. */
export const IDEOGRAM_GENERATOR_MODELS = IDEOGRAM_IMAGE_MODEL_IDS

export type IdeogramGeneratorModel = (typeof IDEOGRAM_GENERATOR_MODELS)[number]

/** @deprecated Use IDEOGRAM_GENERATOR_MODELS — kept for callers that still say "operation". */
export const IDEOGRAM_GENERATOR_OPERATIONS = IDEOGRAM_GENERATOR_MODELS

/** @deprecated Use IdeogramGeneratorModel */
export type IdeogramGeneratorOperation = IdeogramGeneratorModel

/** Tool access list: picker models plus legacy edit / generate_transparent_v3. */
export const IDEOGRAM_GENERATOR_TOOL_IDS = IDEOGRAM_RESOLVABLE_IMAGE_MODEL_IDS.map(
  (model) => `ideogram_${model}` as const
)

const IMAGE_MODELS = ['remix_v4', 'inpaint_v3'] as const
const TEXT_PROMPT_MODELS = ['generate_v4', 'remix_v4'] as const
const RENDERING_SPEED_MODELS = ['generate_v4', 'remix_v4', 'inpaint_v3'] as const

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

function normalizedModel(values: Record<string, unknown>): string | undefined {
  return typeof values.model === 'string' ? normalizeImageModelId(values.model) : undefined
}

/** Generate 4.0 without Transparent — V4 Magic Prompt / JSON. */
function generateV4Opaque(values: Record<string, unknown>): SubBlockCondition {
  const model = normalizedModel(values)
  if (
    values.provider === 'ideogram' &&
    model === 'generate_v4' &&
    values.transparentBackground !== true
  ) {
    return { field: 'provider', value: 'ideogram' }
  }
  return { field: 'provider', value: '__never__' }
}

/**
 * Transparent-path fields: Generate 4.0 + Transparent, or legacy generate_transparent_v3.
 */
function transparentGeneratePath(values: Record<string, unknown>): SubBlockCondition {
  const model = normalizedModel(values)
  const transparent = values.transparentBackground === true
  if (model === 'generate_transparent_v3' || (model === 'generate_v4' && transparent)) {
    return { field: 'provider', value: 'ideogram' }
  }
  return { field: 'provider', value: '__never__' }
}

/** V4 resolution: Remix always; Generate 4.0 only when Transparent is off. */
function resolutionV4Path(values: Record<string, unknown>): SubBlockCondition {
  const model = normalizedModel(values)
  if (model === 'remix_v4') {
    return { field: 'provider', value: 'ideogram' }
  }
  if (model === 'generate_v4' && values.transparentBackground !== true) {
    return { field: 'provider', value: 'ideogram' }
  }
  return { field: 'provider', value: '__never__' }
}

/** Copyright detection: Remix, or Generate 4.0 when Transparent is off. */
function copyrightDetectionPath(values: Record<string, unknown>): SubBlockCondition {
  const model = normalizedModel(values)
  if (model === 'remix_v4') {
    return { field: 'provider', value: 'ideogram' }
  }
  if (model === 'generate_v4' && values.transparentBackground !== true) {
    return { field: 'provider', value: 'ideogram' }
  }
  return { field: 'provider', value: '__never__' }
}

function inpaintOrTransparentPath(values: Record<string, unknown>): SubBlockCondition {
  const model = normalizedModel(values)
  if (model === 'inpaint_v3') {
    return ideogramModel('inpaint_v3') as SubBlockCondition
  }
  return transparentGeneratePath(values)
}

/**
 * True when Generate 4.0 Transparent is on, or the legacy transparent model is selected.
 */
export function isIdeogramTransparentGenerate(params: Record<string, unknown>): boolean {
  const model =
    typeof params.model === 'string'
      ? normalizeImageModelId(params.model)
      : typeof params.operation === 'string'
        ? normalizeImageModelId(params.operation)
        : undefined
  if (model === 'generate_transparent_v3') return true
  if (model === 'generate_v4' && parseOptionalBooleanInput(params.transparentBackground) === true) {
    return true
  }
  return false
}

/** @deprecated Use IDEOGRAM_IMAGE_MODELS from block-model-config. */
export const IDEOGRAM_OPERATION_OPTIONS = [
  { label: 'Generate 4.0', id: 'generate_v4' },
  { label: 'Remix 4.0', id: 'remix_v4' },
  { label: 'Inpaint 3.0', id: 'inpaint_v3' },
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
    id: 'transparentBackground',
    title: 'Transparent Background',
    type: 'switch',
    tooltip:
      'Generates with a native alpha channel via Ideogram Transparent 3.0. Disables Magic Prompt and JSON prompt (V4-only).',
    condition: ideogramModel('generate_v4'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'useMagicPrompt',
    title: 'Magic Prompt',
    type: 'switch',
    tooltip:
      'Rewrites your text prompt into Ideogram’s structured JSON prompt format for stronger composition and typography results.',
    condition: generateV4Opaque,
    dependsOn: ['provider', 'model', 'transparentBackground'],
  },
  {
    id: 'jsonPrompt',
    title: 'JSON Prompt',
    type: 'code',
    language: 'json',
    placeholder:
      '{ "high_level_description": "...", "compositional_deconstruction": { ... } }',
    mode: 'advanced',
    condition: generateV4Opaque,
    dependsOn: ['provider', 'model', 'transparentBackground'],
  },
  {
    id: 'ideogramPrompt',
    title: 'Prompt',
    type: 'long-input',
    placeholder: 'Describe the desired edit…',
    required: {
      field: 'model',
      value: 'inpaint_v3',
    },
    condition: ideogramModel('inpaint_v3'),
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
    required: false,
    condition: ideogramModel(IMAGE_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'imageRef',
    title: 'Image',
    type: 'short-input',
    placeholder: 'File reference or image URL from a previous block',
    canonicalParamId: 'image',
    mode: 'advanced',
    required: false,
    condition: ideogramModel(IMAGE_MODELS),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'imageUrl',
    title: 'Image URL (alternative)',
    type: 'short-input',
    placeholder: 'Publicly accessible image URL (use if not uploading a file)',
    required: false,
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
    required: false,
    condition: ideogramModel('inpaint_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'maskRef',
    title: 'Mask',
    type: 'short-input',
    placeholder: 'File reference or mask URL from a previous block',
    canonicalParamId: 'mask',
    mode: 'advanced',
    required: false,
    condition: ideogramModel('inpaint_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'maskUrl',
    title: 'Mask URL (alternative)',
    type: 'short-input',
    placeholder: 'Publicly accessible mask URL (use if not uploading a file)',
    required: false,
    condition: ideogramModel('inpaint_v3'),
    dependsOn: ['provider', 'model'],
  },
  {
    id: 'resolutionV4',
    title: 'Resolution',
    type: 'dropdown',
    options: toDropdownOptions(RESOLUTION_V4_OPTIONS),
    clearable: true,
    value: () => '',
    condition: resolutionV4Path,
    dependsOn: ['provider', 'model', 'transparentBackground'],
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
    condition: transparentGeneratePath,
    dependsOn: ['provider', 'model', 'transparentBackground'],
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
    condition: transparentGeneratePath,
    dependsOn: ['provider', 'model', 'transparentBackground'],
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
    condition: copyrightDetectionPath,
    dependsOn: ['provider', 'model', 'transparentBackground'],
  },
  {
    id: 'numImages',
    title: 'Number of Images',
    type: 'short-input',
    placeholder: '1',
    mode: 'advanced',
    condition: inpaintOrTransparentPath,
    dependsOn: ['provider', 'model', 'transparentBackground'],
  },
  {
    id: 'seed',
    title: 'Seed',
    type: 'short-input',
    placeholder: 'Optional seed',
    mode: 'advanced',
    condition: inpaintOrTransparentPath,
    dependsOn: ['provider', 'model', 'transparentBackground'],
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
    (IDEOGRAM_RESOLVABLE_IMAGE_MODEL_IDS as readonly string[]).includes(params.operation.trim())
  ) {
    return true
  }

  return false
}

/**
 * Resolves the Ideogram tool ID for Image Generator when provider/model is Ideogram.
 */
export function resolveIdeogramToolId(params: Record<string, unknown>): string {
  const rawImage = params.uploadImage || params.imageRef || params.image
  const image = normalizeFileInput(rawImage, {
    single: true,
  })
  if (image) {
    params.image = image
  } else if (
    !params.imageUrl &&
    typeof rawImage === 'string' &&
    rawImage.trim().length > 0 &&
    !rawImage.trim().startsWith('{') &&
    !rawImage.trim().startsWith('[')
  ) {
    params.imageUrl = rawImage.trim()
  }

  const rawMask = params.uploadMask || params.maskRef || params.mask
  const mask = normalizeFileInput(rawMask, {
    single: true,
  })
  if (mask) {
    params.mask = mask
  } else if (
    !params.maskUrl &&
    typeof rawMask === 'string' &&
    rawMask.trim().length > 0 &&
    !rawMask.trim().startsWith('{') &&
    !rawMask.trim().startsWith('[')
  ) {
    params.maskUrl = rawMask.trim()
  }

  if (typeof params.imageUrl === 'string' && params.imageUrl.trim().length > 0) {
    params.imageUrl = params.imageUrl.trim()
  }

  if (typeof params.maskUrl === 'string' && params.maskUrl.trim().length > 0) {
    params.maskUrl = params.maskUrl.trim()
  }

  // Legacy Edit workflows may still carry multi-image fields
  const images = normalizeFileInput(params.uploadImages || params.imagesRef || params.images)
  if (images) params.images = images

  const editImageUrl =
    typeof params.editImageUrl === 'string' && params.editImageUrl.trim().length > 0
      ? params.editImageUrl.trim()
      : ''
  if (editImageUrl) {
    const existing = params.imageUrls
    if (!existing) {
      params.imageUrls = [editImageUrl]
    }
  }

  const fromModel =
    typeof params.model === 'string' && params.model.trim().length > 0
      ? params.model.trim()
      : ''
  const fromOperation =
    typeof params.operation === 'string' && params.operation.trim().length > 0
      ? params.operation.trim()
      : ''
  const candidate = normalizeImageModelId(fromModel || fromOperation) || 'generate_v4'

  if (candidate === 'generate_v4' && isIdeogramTransparentGenerate(params)) {
    return 'ideogram_generate_transparent_v3'
  }

  const modelId = (IDEOGRAM_RESOLVABLE_IMAGE_MODEL_IDS as readonly string[]).includes(candidate)
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

  const imageUrl =
    typeof params.imageUrl === 'string' && params.imageUrl.trim().length > 0
      ? params.imageUrl.trim()
      : undefined
  const maskUrl =
    typeof params.maskUrl === 'string' && params.maskUrl.trim().length > 0
      ? params.maskUrl.trim()
      : undefined

  const transparent = isIdeogramTransparentGenerate(params)
  const textPrompt =
    typeof params.textPrompt === 'string' && params.textPrompt.trim().length > 0
      ? params.textPrompt
      : undefined
  const ideogramPrompt =
    params.ideogramPrompt ?? (typeof params.prompt === 'string' ? params.prompt : undefined)

  const modelCandidate =
    (typeof params.model === 'string' && params.model.trim().length > 0
      ? normalizeImageModelId(params.model.trim())
      : undefined) ||
    (typeof params.operation === 'string' && params.operation.trim().length > 0
      ? normalizeImageModelId(params.operation.trim())
      : undefined)

  return {
    ...(typeof params.apiKey === 'string' && params.apiKey.trim().length > 0
      ? { apiKey: params.apiKey }
      : {}),
    ...(transparent
      ? {
          ...(textPrompt || ideogramPrompt
            ? { prompt: textPrompt ?? ideogramPrompt }
            : {}),
        }
      : {
          ...(textPrompt ? { textPrompt } : {}),
          ...(params.jsonPrompt !== undefined ? { jsonPrompt: params.jsonPrompt } : {}),
          ...(parseOptionalBooleanInput(params.useMagicPrompt) !== undefined
            ? { useMagicPrompt: parseOptionalBooleanInput(params.useMagicPrompt) }
            : {}),
          ...(ideogramPrompt !== undefined && ideogramPrompt !== null && ideogramPrompt !== ''
            ? { prompt: ideogramPrompt }
            : {}),
        }),
    image: params.image,
    ...(imageUrl ? { imageUrl } : {}),
    mask: params.mask,
    ...(maskUrl ? { maskUrl } : {}),
    images: params.images,
    imageUrls: params.imageUrls,
    ...(!transparent
      ? {
          resolution: params.resolutionV4 || params.ideogramResolution || params.resolution,
        }
      : {}),
    aspectRatio: params.ideogramAspectRatio || params.aspectRatio,
    renderingSpeed: params.renderingSpeed,
    styleType: params.styleType,
    upscaleFactor: params.upscaleFactor,
    ...(!transparent && params.enableCopyrightDetection !== undefined
      ? { enableCopyrightDetection: params.enableCopyrightDetection }
      : {}),
    ...(modelCandidate === 'edit'
      ? {
          transparentBackground: parseOptionalBooleanInput(params.transparentBackground),
        }
      : {}),
    numImages: toNumber(params.numImages),
    seed: toNumber(params.seed),
    imageWeight: toNumber(params.imageWeight),
  }
}

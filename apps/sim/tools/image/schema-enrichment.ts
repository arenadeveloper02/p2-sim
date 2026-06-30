import {
  GEMINI_IMAGE_MODELS,
  getImageBlockModelsForProvider,
  OPENAI_GPT_IMAGE_MODELS,
} from '@/lib/image-generation/block-model-config'

const IMAGE_PROVIDERS = ['openai', 'gemini', 'falai'] as const

const FALAI_IMAGE_MODEL_IDS = [
  'nano-banana-2',
  'nano-banana-pro',
  'gpt-image-1.5',
  'seedream-v4.5',
  'flux-2-pro',
  'grok-imagine-image',
  'nano-banana',
] as const

const GEMINI_BASE_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const

const GEMINI_EXTREME_ASPECT_RATIOS = ['1:4', '1:8', '4:1', '8:1'] as const

const FALAI_NANO_BANANA_ASPECT_RATIOS = [
  'auto',
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
] as const

const FALAI_EXTREME_ASPECT_RATIOS = ['4:1', '1:4', '8:1', '1:8'] as const

const ASPECT_RATIOS_BY_MODEL: Record<string, readonly string[]> = {
  'gemini-3.1-flash-image-preview': [...GEMINI_BASE_ASPECT_RATIOS, ...GEMINI_EXTREME_ASPECT_RATIOS],
  'gemini-3-pro-image-preview': GEMINI_BASE_ASPECT_RATIOS,
  'gemini-2.5-flash-image': GEMINI_BASE_ASPECT_RATIOS,
  'nano-banana-2': [...FALAI_NANO_BANANA_ASPECT_RATIOS, ...FALAI_EXTREME_ASPECT_RATIOS],
  'nano-banana-pro': ['auto', ...GEMINI_BASE_ASPECT_RATIOS],
  'nano-banana': GEMINI_BASE_ASPECT_RATIOS,
}

const RESOLUTIONS_BY_MODEL: Record<string, readonly string[]> = {
  'gemini-3.1-flash-image-preview': ['512', '1K', '2K', '4K'],
  'gemini-3-pro-image-preview': ['1K', '2K', '4K'],
  'nano-banana-2': ['0.5K', '1K', '2K', '4K'],
  'nano-banana-pro': ['1K', '2K', '4K'],
  'grok-imagine-image': ['1k', '2k'],
}

function formatAllowedValues(values: readonly string[]): string {
  return values.join(', ')
}

function getModelIdsForProvider(provider: string): string[] {
  const normalized = provider.trim().toLowerCase()
  if (normalized === 'openai') {
    return OPENAI_GPT_IMAGE_MODELS.map((model) => model.id)
  }
  if (normalized === 'gemini') {
    return GEMINI_IMAGE_MODELS.map((model) => model.id)
  }
  if (normalized === 'falai') {
    return [...FALAI_IMAGE_MODEL_IDS]
  }
  const blockModels = getImageBlockModelsForProvider(normalized).map((model) => model.id)
  return blockModels.length > 0 ? blockModels : []
}

/**
 * Builds an LLM schema fragment listing allowed model IDs for the selected provider.
 */
export async function enrichImageModelSchema(provider: string): Promise<{
  type: string
  enum?: string[]
  description?: string
} | null> {
  const modelIds = getModelIdsForProvider(provider)
  if (modelIds.length === 0) {
    return null
  }

  return {
    type: 'string',
    enum: modelIds,
    description: `Exact model ID for provider "${provider}". Allowed values: ${formatAllowedValues(modelIds)}`,
  }
}

/**
 * Builds an LLM schema fragment listing allowed aspect ratios for the selected model.
 */
export async function enrichImageAspectRatioSchema(model: string): Promise<{
  type: string
  enum?: string[]
  description?: string
} | null> {
  const allowed = ASPECT_RATIOS_BY_MODEL[model]
  if (!allowed || allowed.length === 0) {
    return {
      type: 'string',
      description:
        'Aspect ratio when supported by the selected model. OpenAI GPT Image models use the size field instead of aspect ratio.',
    }
  }

  return {
    type: 'string',
    enum: [...allowed],
    description: `Aspect ratio for model "${model}". Allowed values: ${formatAllowedValues(allowed)}`,
  }
}

/**
 * Builds an LLM schema fragment listing allowed resolutions for the selected model.
 */
export async function enrichImageResolutionSchema(model: string): Promise<{
  type: string
  enum?: string[]
  description?: string
} | null> {
  const allowed = RESOLUTIONS_BY_MODEL[model]
  if (!allowed || allowed.length === 0) {
    return {
      type: 'string',
      description:
        'Output resolution when supported by the selected model. Omit when the model does not expose resolution.',
    }
  }

  return {
    type: 'string',
    enum: [...allowed],
    description: `Resolution for model "${model}". Allowed values: ${formatAllowedValues(allowed)}`,
  }
}

export const IMAGE_PROVIDER_DESCRIPTION = `Image generation provider. Allowed values: ${formatAllowedValues(IMAGE_PROVIDERS)}`

export const IMAGE_MODEL_DESCRIPTION = `Provider model ID. Use the exact ID for the selected provider. OpenAI: ${formatAllowedValues(OPENAI_GPT_IMAGE_MODELS.map((m) => m.id))}. Gemini: ${formatAllowedValues(GEMINI_IMAGE_MODELS.map((m) => m.id))}. Fal.ai: ${formatAllowedValues(FALAI_IMAGE_MODEL_IDS)}`

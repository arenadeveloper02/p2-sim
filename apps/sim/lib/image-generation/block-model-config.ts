export type ImageBlockProvider = 'openai' | 'gemini'

export interface ImageBlockModelOption {
  label: string
  id: string
}

export interface ImageBlockModelDefinition {
  id: string
  label: string
  provider: ImageBlockProvider
  supportsReferenceImages: boolean
  maxReferenceImages: number
}

const OPENAI_MODEL_DEFINITIONS: ImageBlockModelDefinition[] = [
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    provider: 'openai',
    supportsReferenceImages: true,
    maxReferenceImages: 1,
  },
  {
    id: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    provider: 'openai',
    supportsReferenceImages: true,
    maxReferenceImages: 1,
  },
  {
    id: 'gpt-image-1',
    label: 'GPT Image 1',
    provider: 'openai',
    supportsReferenceImages: true,
    maxReferenceImages: 1,
  },
  {
    id: 'gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    provider: 'openai',
    supportsReferenceImages: true,
    maxReferenceImages: 1,
  },
]

const GEMINI_MODEL_DEFINITIONS: ImageBlockModelDefinition[] = [
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    provider: 'gemini',
    supportsReferenceImages: true,
    maxReferenceImages: 14,
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    provider: 'gemini',
    supportsReferenceImages: true,
    maxReferenceImages: 11,
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    provider: 'gemini',
    supportsReferenceImages: true,
    maxReferenceImages: 3,
  },
]

export const IMAGE_BLOCK_MODEL_DEFINITIONS: ImageBlockModelDefinition[] = [
  ...OPENAI_MODEL_DEFINITIONS,
  ...GEMINI_MODEL_DEFINITIONS,
]

export const IMAGE_BLOCK_PROVIDER_OPTIONS: Array<{ label: string; id: ImageBlockProvider }> = [
  { label: 'OpenAI', id: 'openai' },
  { label: 'Google Gemini', id: 'gemini' },
]

export function toModelDropdownOptions(
  models: ImageBlockModelDefinition[]
): ImageBlockModelOption[] {
  return models.map((model) => ({ label: model.label, id: model.id }))
}

export function getImageBlockModelsForProvider(provider: string): ImageBlockModelDefinition[] {
  return IMAGE_BLOCK_MODEL_DEFINITIONS.filter((model) => model.provider === provider)
}

export function getImageBlockModelDefinition(modelId: string): ImageBlockModelDefinition | undefined {
  return IMAGE_BLOCK_MODEL_DEFINITIONS.find((model) => model.id === modelId)
}

export function getReferenceImageModelIds(): string[] {
  return IMAGE_BLOCK_MODEL_DEFINITIONS.filter((model) => model.supportsReferenceImages).map(
    (model) => model.id
  )
}

export function getMaxReferenceImages(modelId: string): number {
  return getImageBlockModelDefinition(modelId)?.maxReferenceImages ?? 1
}

export function supportsMultipleReferenceImages(modelId: string): boolean {
  return getMaxReferenceImages(modelId) > 1
}

export const OPENAI_GPT_IMAGE_MODELS = toModelDropdownOptions(OPENAI_MODEL_DEFINITIONS)
export const GEMINI_IMAGE_MODELS = toModelDropdownOptions(GEMINI_MODEL_DEFINITIONS)

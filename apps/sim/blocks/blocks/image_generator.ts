import { ImageIcon } from '@/components/icons'
import {
  IDEOGRAM_RENDERING_SPEEDS,
  IDEOGRAM_V4_MODEL,
  IDEOGRAM_V4_RESOLUTIONS,
} from '@/lib/ideogram/constants'
import {
  NANO_BANANA_MODELS,
  NANO_BANANA_PRO_MODEL,
  resolveNanoBananaReferences,
} from '@/lib/image-generation/nano-banana-inputs'
import { AuthMode, type BlockConfig, IntegrationType } from '@/blocks/types'
import {
  createVersionedToolSelector,
  normalizeFileInput,
  parseOptionalBooleanInput,
} from '@/blocks/utils'
import type { ImageGenerationResponse } from '@/tools/image/types'

function parseIdeogramJsonPromptParam(value: unknown): unknown | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error('jsonPrompt must be valid JSON')
    }
  }
  return value
}

const IDEOGRAM_RESOLUTION_OPTIONS = IDEOGRAM_V4_RESOLUTIONS.map((resolution) => ({
  label: resolution,
  id: resolution,
}))

const IDEOGRAM_RENDERING_SPEED_OPTIONS = IDEOGRAM_RENDERING_SPEEDS.map((speed) => ({
  label: speed,
  id: speed,
}))

function normalizeReferenceFiles(input: unknown): unknown[] {
  const normalizedFiles = normalizeFileInput(input)
  if (Array.isArray(normalizedFiles)) {
    return normalizedFiles
  }
  if (normalizedFiles) {
    return [normalizedFiles]
  }
  return []
}

const OPENAI_GPT_IMAGE_MODELS = [
  { label: 'GPT Image 2', id: 'gpt-image-2' },
  { label: 'GPT Image 1.5', id: 'gpt-image-1.5' },
  { label: 'GPT Image 1', id: 'gpt-image-1' },
  { label: 'GPT Image 1 Mini', id: 'gpt-image-1-mini' },
]

const GEMINI_IMAGE_MODELS = [
  { label: 'Nano Banana 2', id: 'gemini-3.1-flash-image-preview' },
  { label: 'Nano Banana Pro', id: 'gemini-3-pro-image-preview' },
  { label: 'Nano Banana', id: 'gemini-2.5-flash-image' },
]

const FALAI_IMAGE_MODELS = [
  { label: 'Nano Banana 2', id: 'nano-banana-2' },
  { label: 'Nano Banana Pro', id: 'nano-banana-pro' },
  { label: 'GPT Image 1.5', id: 'gpt-image-1.5' },
  { label: 'Seedream 4.5', id: 'seedream-v4.5' },
  { label: 'FLUX 2 Pro', id: 'flux-2-pro' },
  { label: 'Grok Imagine Image', id: 'grok-imagine-image' },
  { label: 'Nano Banana', id: 'nano-banana' },
]

const BASE_ASPECT_RATIO_OPTIONS = [
  { label: '1:1', id: '1:1' },
  { label: '16:9', id: '16:9' },
  { label: '9:16', id: '9:16' },
  { label: '3:2', id: '3:2' },
  { label: '2:3', id: '2:3' },
  { label: '4:3', id: '4:3' },
  { label: '3:4', id: '3:4' },
  { label: '5:4', id: '5:4' },
  { label: '4:5', id: '4:5' },
  { label: '21:9', id: '21:9' },
]

const EXTREME_ASPECT_RATIO_OPTIONS = [
  { label: '4:1', id: '4:1' },
  { label: '1:4', id: '1:4' },
  { label: '8:1', id: '8:1' },
  { label: '1:8', id: '1:8' },
]

const OUTPUT_FORMAT_OPTIONS = [
  { label: 'PNG', id: 'png' },
  { label: 'JPEG', id: 'jpeg' },
  { label: 'WebP', id: 'webp' },
]

export const ImageGeneratorBlockV2: BlockConfig = {
  type: 'image_generator',
  name: 'Image Generator',
  description: 'Generate, edit, or fuse images',
  hideFromToolbar: true,
  authMode: AuthMode.ApiKey,
  longDescription:
    'Integrate Image Generator into the workflow. Can generate images using DALL-E 3 and GPT Image models.',
  docsLink: 'https://docs.sim.ai/integrations/image_generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#4D5FFF',
  icon: ImageIcon,
  subBlocks: [
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: [
        { label: 'Nano Banana', id: 'gemini-2.5-flash-image' },
        // { label: 'GPT Image', id: 'gpt-image-1' },
        { label: 'Nano Banana Pro', id: NANO_BANANA_PRO_MODEL },
        { label: 'DALL-E 3', id: 'dall-e-3' },
        { label: 'GPT Image 1', id: 'gpt-image-1' },
        { label: 'GPT Image 2', id: 'gpt-image-2' },
      ],
      value: () => NANO_BANANA_PRO_MODEL,
    },
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      required: true,
      placeholder: 'Describe the image you want to generate, edit, or fuse...',
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: '1024x1024', id: '1024x1024' },
        { label: '1024x1792', id: '1024x1792' },
        { label: '1792x1024', id: '1792x1024' },
      ],
      value: () => '1024x1024',
      condition: { field: 'model', value: 'dall-e-3' },
      dependsOn: ['model'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: '1024x1024', id: '1024x1024' },
        { label: '1536x1024', id: '1536x1024' },
        { label: '1024x1536', id: '1024x1536' },
      ],
      value: () => 'auto',
      condition: { field: 'model', value: 'gpt-image-1' },
      dependsOn: ['model'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Square (1024x1024)', id: '1024x1024' },
        { label: 'Portrait (1024x1536)', id: '1024x1536' },
        { label: 'Landscape (1536x1024)', id: '1536x1024' },
        { label: '2K (2560x1440)', id: '2560x1440' },
        { label: '4K (3840x2160)', id: '3840x2160' },
      ],
      value: () => 'auto',
      condition: { field: 'model', value: 'gpt-image-2' },
      dependsOn: ['model'],
    },
    {
      id: 'quality',
      title: 'Quality',
      type: 'dropdown',
      options: [
        { label: 'Standard', id: 'standard' },
        { label: 'HD', id: 'hd' },
      ],
      value: () => 'standard',
      condition: { field: 'model', value: 'dall-e-3' },
      dependsOn: ['model'],
    },
    {
      id: 'quality',
      title: 'Quality',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Low', id: 'low' },
        { label: 'Medium', id: 'medium' },
        { label: 'High', id: 'high' },
      ],
      value: () => 'auto',
      condition: { field: 'model', value: ['gpt-image-1', 'gpt-image-2'] },
      dependsOn: ['model'],
    },
    {
      id: 'style',
      title: 'Style',
      type: 'dropdown',
      options: [
        { label: 'Vivid', id: 'vivid' },
        { label: 'Natural', id: 'natural' },
      ],
      value: () => 'vivid',
      condition: { field: 'model', value: 'dall-e-3' },
      dependsOn: ['model'],
    },
    {
      id: 'background',
      title: 'Background',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Transparent', id: 'transparent' },
        { label: 'Opaque', id: 'opaque' },
      ],
      value: () => 'auto',
      condition: { field: 'model', value: 'gpt-image-1' },
      dependsOn: ['model'],
    },
    {
      id: 'background',
      title: 'Background',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Opaque', id: 'opaque' },
      ],
      value: () => 'auto',
      condition: { field: 'model', value: 'gpt-image-2' },
      dependsOn: ['model'],
    },
    {
      id: 'outputFormat',
      title: 'Output Format',
      type: 'dropdown',
      options: [
        { label: 'PNG', id: 'png' },
        { label: 'JPEG', id: 'jpeg' },
        { label: 'WebP', id: 'webp' },
      ],
      value: () => 'png',
      condition: { field: 'model', value: ['gpt-image-1', 'gpt-image-2'] },
      dependsOn: ['model'],
    },
    {
      id: 'moderation',
      title: 'Moderation',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Low', id: 'low' },
      ],
      value: () => 'auto',
      condition: { field: 'model', value: ['gpt-image-1', 'gpt-image-2'] },
      dependsOn: ['model'],
    },
    {
      id: 'imageSize',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: '1K', id: '1K' },
        { label: '2K', id: '2K' },
      ],
      value: () => '1K',
      condition: { field: 'model', value: 'imagen-4.0-generate-001' },
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [
        { label: '1:1', id: '1:1' },
        { label: '3:4', id: '3:4' },
        { label: '4:3', id: '4:3' },
        { label: '9:16', id: '9:16' },
        { label: '16:9', id: '16:9' },
      ],
      value: () => '1:1',
      condition: { field: 'model', value: 'imagen-4.0-generate-001' },
    },
    {
      id: 'personGeneration',
      title: 'Person Generation',
      type: 'dropdown',
      options: [
        { label: "Don't Allow", id: 'dont_allow' },
        { label: 'Allow Adult', id: 'allow_adult' },
        { label: 'Allow All', id: 'allow_all' },
      ],
      value: () => 'allow_adult',
      condition: { field: 'model', value: 'imagen-4.0-generate-001' },
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [
        { label: '1:1', id: '1:1' },
        { label: '2:3', id: '2:3' },
        { label: '3:2', id: '3:2' },
        { label: '3:4', id: '3:4' },
        { label: '4:3', id: '4:3' },
        { label: '4:5', id: '4:5' },
        { label: '5:4', id: '5:4' },
        { label: '9:16', id: '9:16' },
        { label: '16:9', id: '16:9' },
        { label: '21:9', id: '21:9' },
      ],
      value: () => '1:1',
      condition: {
        field: 'model',
        value: ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
      },
    },
    {
      id: 'imageSize',
      title: 'Resolution',
      type: 'dropdown',
      options: [
        { label: '1K', id: '1K' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '1K',
      condition: { field: 'model', value: NANO_BANANA_PRO_MODEL },
    },
    {
      id: 'inputImage',
      title: 'Reference Images',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      multiple: true,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
      defaultValue: '<start.files>',
      condition: {
        field: 'model',
        value: NANO_BANANA_MODELS,
      },
    },
    {
      id: 'inputImageUrl',
      title: 'Reference Image URLs',
      type: 'long-input',
      placeholder:
        'Optional: add one or more image URLs or references. One image edits, multiple images fuse.',
      mode: 'advanced',
      condition: {
        field: 'model',
        value: NANO_BANANA_MODELS,
      },
    },
    {
      id: 'inputImages',
      title: 'Legacy Fusion Images',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      multiple: true,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
      hidden: true,
      condition: { field: 'model', value: NANO_BANANA_PRO_MODEL },
    },
    {
      id: 'inputImageUrls',
      title: 'Legacy Fusion Image URLs',
      type: 'long-input',
      placeholder:
        'Optional: enter fusion image URLs (one per line or comma-separated), or use a reference like <agent1.urls>.',
      hidden: true,
      condition: { field: 'model', value: NANO_BANANA_PRO_MODEL },
    },
  ],
  tools: {
    access: ['openai_image_v2', 'google_imagen_v2', 'google_nano_banana_v2'],
    config: {
      tool: createVersionedToolSelector({
        baseToolSelector: (params) => {
          if (params.model?.startsWith('imagen-')) {
            return 'google_imagen'
          }
          if (params.model?.startsWith('gemini-')) {
            return 'google_nano_banana'
          }
          return 'openai_image'
        },
        suffix: '_v2',
        fallbackToolId: 'openai_image_v2',
      }),
      params: (params) => {
        if (!params.prompt) {
          throw new Error('Prompt is required')
        }

        if (params.model?.startsWith('imagen-')) {
          return {
            model: params.model,
            prompt: params.prompt,
            imageSize: params.imageSize || '1K',
            aspectRatio: params.aspectRatio || '1:1',
            personGeneration: params.personGeneration || 'allow_adult',
          }
        }

        if (params.model?.startsWith('gemini-')) {
          const nanoBananaReferences = resolveNanoBananaReferences({
            model: params.model,
            uploadedReferences: [
              ...normalizeReferenceFiles(params.inputImage),
              ...normalizeReferenceFiles(params.inputImages),
            ],
            inputImageUrl: params.inputImageUrl,
            inputImageUrls: params.inputImageUrls,
          })

          const geminiParams: Record<string, unknown> = {
            model: params.model,
            prompt: params.prompt,
            aspectRatio: params.aspectRatio || '1:1',
            inputImage: undefined,
            inputImages: undefined,
            inputImageUrl: undefined,
            inputImageUrls: undefined,
            ...(params.inputImageMimeType ? { inputImageMimeType: params.inputImageMimeType } : {}),
            ...(nanoBananaReferences.inputImageWarning
              ? { inputImageWarning: nanoBananaReferences.inputImageWarning }
              : {}),
          }

          if (nanoBananaReferences.inputImages) {
            geminiParams.inputImages = nanoBananaReferences.inputImages
          } else if (nanoBananaReferences.inputImage) {
            geminiParams.inputImage = nanoBananaReferences.inputImage
          }

          if (params.model === NANO_BANANA_PRO_MODEL) {
            geminiParams.imageSize = params.imageSize || '1K'
          }

          return geminiParams
        }

        const model = params.model || 'dall-e-3'

        const ALLOWED_SIZES: Record<string, string[]> = {
          'dall-e-3': ['1024x1024', '1024x1792', '1792x1024'],
          'gpt-image-1': ['auto', '1024x1024', '1536x1024', '1024x1536'],
          'gpt-image-2': ['auto', '1024x1024', '1536x1024', '1024x1536', '2560x1440', '3840x2160'],
        }
        const ALLOWED_QUALITIES: Record<string, string[]> = {
          'dall-e-3': ['standard', 'hd'],
          'gpt-image-1': ['auto', 'low', 'medium', 'high'],
          'gpt-image-2': ['auto', 'low', 'medium', 'high'],
        }
        const ALLOWED_BACKGROUNDS: Record<string, string[]> = {
          'gpt-image-1': ['auto', 'transparent', 'opaque'],
          'gpt-image-2': ['auto', 'opaque'],
        }

        const defaultSize = model === 'dall-e-3' ? '1024x1024' : 'auto'
        const size = ALLOWED_SIZES[model]?.includes(params.size) ? params.size : defaultSize

        const baseParams = {
          prompt: params.prompt,
          model,
          size,
          apiKey: params.apiKey,
        }

        if (model === 'dall-e-3') {
          const quality = ALLOWED_QUALITIES['dall-e-3'].includes(params.quality)
            ? params.quality
            : 'standard'
          const style = ['vivid', 'natural'].includes(params.style) ? params.style : 'vivid'
          return { ...baseParams, quality, style }
        }
        if (model === 'gpt-image-1' || model === 'gpt-image-2') {
          const quality = ALLOWED_QUALITIES[model].includes(params.quality)
            ? params.quality
            : undefined
          const background = ALLOWED_BACKGROUNDS[model].includes(params.background)
            ? params.background
            : undefined
          return {
            ...baseParams,
            ...(quality && { quality }),
            ...(background && { background }),
            ...(params.outputFormat && { outputFormat: params.outputFormat }),
            ...(params.moderation && { moderation: params.moderation }),
          }
        }

        return baseParams
      },
    },
  },
  inputs: {
    prompt: { type: 'string', description: 'Image description prompt' },
    model: { type: 'string', description: 'Image generation model' },
    size: { type: 'string', description: 'Image dimensions' },
    quality: { type: 'string', description: 'Image quality level' },
    style: { type: 'string', description: 'Image style' },
    background: { type: 'string', description: 'Background type' },
    aspectRatio: { type: 'string', description: 'Image aspect ratio' },
    imageSize: { type: 'string', description: 'Output resolution (1K/2K/4K) for Nano Banana Pro' },
    personGeneration: { type: 'string', description: 'Person generation setting' },
    inputImage: {
      type: 'json',
      description:
        'Reference images for Nano Banana as uploaded UserFiles, Start block files, or file references. One image edits; multiple images fuse on Nano Banana Pro.',
    },
    inputImageUrl: {
      type: 'string',
      description:
        'Reference image URLs or refs for Nano Banana. One image edits; multiple images fuse on Nano Banana Pro.',
    },
    inputImages: {
      type: 'json',
      description:
        'Multiple input images for Nano Banana Pro fusion as uploaded UserFiles, Start block files, URLs, or storage references',
    },
    inputImageUrls: {
      type: 'string',
      description:
        'Multiple image URLs or references for Nano Banana Pro fusion (newline or comma-separated)',
    },
    inputImageMimeType: { type: 'string', description: 'MIME type of input image' },
    inputImageWarning: {
      type: 'string',
      description:
        'Warning emitted when multiple input images were provided and the latest one was used',
    },
    outputFormat: { type: 'string', description: 'Output image format (png, jpeg, webp)' },
    moderation: { type: 'string', description: 'Moderation level (auto or low)' },
    // apiKey: { type: 'string', description: 'OpenAI API key' },
  },
  outputs: {
    content: { type: 'string', description: 'Generation response' },
    image: { type: 'file', description: 'Generated image file (UserFile)' },
    images: {
      type: 'array',
      description: 'All generated image files when the Images count is greater than 1',
    },
    metadata: { type: 'json', description: 'Generation metadata' },
  },
}

export const ImageGeneratorBlock = ImageGeneratorBlockV2

const IMAGE_GENERATOR_V2_INPUTS = {
  provider: { type: 'string', description: 'Image generation provider' },
  prompt: { type: 'string', description: 'Image description prompt' },
  jsonPrompt: { type: 'json', description: 'Ideogram v4 structured json_prompt' },
  magicPrompt: {
    type: 'boolean',
    description: 'Use Ideogram text_prompt path so Ideogram can apply Magic Prompt',
  },
  remixImage: { type: 'json', description: 'Source image file for Ideogram Remix' },
  remixImageUrl: { type: 'string', description: 'Source image URL for Ideogram Remix' },
  imageWeight: { type: 'number', description: 'Ideogram Remix image weight' },
  renderingSpeed: { type: 'string', description: 'Ideogram rendering speed' },
  enableCopyrightDetection: {
    type: 'boolean',
    description: 'Enable Ideogram copyright detection',
  },
  model: { type: 'string', description: 'Image generation model' },
  size: { type: 'string', description: 'Image size' },
  aspectRatio: { type: 'string', description: 'Image aspect ratio' },
  resolution: { type: 'string', description: 'Image resolution' },
  quality: { type: 'string', description: 'Image quality level' },
  background: { type: 'string', description: 'Background type' },
  outputFormat: { type: 'string', description: 'Output image format' },
  moderation: { type: 'string', description: 'Moderation level' },
  safetyTolerance: { type: 'string', description: 'Fal.ai safety tolerance' },
  thinkingLevel: { type: 'string', description: 'Fal.ai thinking level' },
  enableWebSearch: { type: 'boolean', description: 'Enable Fal.ai web search grounding' },
  enableSafetyChecker: { type: 'boolean', description: 'Enable Fal.ai safety checker' },
  inputImage: {
    type: 'json',
    description:
      'Reference images as uploaded files, Start block files, or file references. One image edits; multiple images fuse on supported models.',
  },
  inputImageUrl: {
    type: 'string',
    description:
      'Reference image URLs or refs. One image edits; multiple images fuse on supported models.',
  },
  inputImages: {
    type: 'json',
    description: 'Multiple input images for Gemini Nano Banana Pro fusion.',
  },
  inputImageUrls: {
    type: 'string',
    description: 'Multiple image URLs or references for Gemini Nano Banana Pro fusion.',
  },
  inputImageMimeType: { type: 'string', description: 'MIME type of input image' },
  inputImageWarning: {
    type: 'string',
    description:
      'Warning emitted when multiple input images were provided and the latest one was used.',
  },
  apiKey: { type: 'string', description: 'Provider API key' },
} as const

export const ImageGeneratorV2Block: BlockConfig<ImageGenerationResponse> = {
  type: 'image_generator_v2',
  name: 'Image Generator',
  description: 'Generate images',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Generate images using OpenAI GPT Image, Google Nano Banana, Fal.ai, or Ideogram 4 image models.',
  docsLink: 'https://docs.sim.ai/integrations/image_generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#4D5FFF',
  icon: ImageIcon,
  subBlocks: [
    {
      id: 'provider',
      title: 'Provider',
      type: 'dropdown',
      options: [
        { label: 'OpenAI', id: 'openai' },
        { label: 'Google Gemini', id: 'gemini' },
        { label: 'Fal.ai (Multi-Model)', id: 'falai' },
        { label: 'Ideogram', id: 'ideogram' },
      ],
      commandSearchable: true,
      value: () => 'falai',
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: OPENAI_GPT_IMAGE_MODELS,
      value: () => 'gpt-image-1.5',
      condition: { field: 'provider', value: 'openai' },
      dependsOn: ['provider'],
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: GEMINI_IMAGE_MODELS,
      value: () => 'gemini-3.1-flash-image-preview',
      condition: { field: 'provider', value: 'gemini' },
      dependsOn: ['provider'],
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: FALAI_IMAGE_MODELS,
      value: () => 'nano-banana-2',
      condition: { field: 'provider', value: 'falai' },
      dependsOn: ['provider'],
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: [{ label: 'Ideogram 4', id: IDEOGRAM_V4_MODEL }],
      value: () => IDEOGRAM_V4_MODEL,
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      required: { field: 'provider', value: 'ideogram', not: true },
      placeholder: 'Describe the image you want to generate...',
    },
    {
      id: 'jsonPrompt',
      title: 'JSON Prompt',
      type: 'long-input',
      placeholder: 'Connect Ideogram Prompt Builder jsonPrompt output or paste structured JSON',
      connectionDroppable: true,
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'magicPrompt',
      title: 'Magic Prompt',
      type: 'switch',
      defaultValue: true,
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Square (1024x1024)', id: '1024x1024' },
        { label: 'Landscape (1536x1024)', id: '1536x1024' },
        { label: 'Portrait (1024x1536)', id: '1024x1536' },
      ],
      value: () => 'auto',
      condition: {
        field: 'provider',
        value: 'openai',
        and: { field: 'model', value: ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'] },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Square (1024x1024)', id: '1024x1024' },
        { label: 'Landscape (1536x1024)', id: '1536x1024' },
        { label: 'Portrait (1024x1536)', id: '1024x1536' },
        { label: '2K (2560x1440)', id: '2560x1440' },
        { label: '4K (3840x2160)', id: '3840x2160' },
      ],
      value: () => 'auto',
      condition: {
        field: 'provider',
        value: 'openai',
        and: { field: 'model', value: 'gpt-image-2' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Square (1024x1024)', id: '1024x1024' },
        { label: 'Landscape (1536x1024)', id: '1536x1024' },
        { label: 'Portrait (1024x1536)', id: '1024x1536' },
      ],
      value: () => '1024x1024',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'gpt-image-1.5' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Auto 2K', id: 'auto_2K' },
        { label: 'Auto 4K', id: 'auto_4K' },
        { label: 'Square HD', id: 'square_hd' },
        { label: 'Square', id: 'square' },
        { label: 'Portrait 4:3', id: 'portrait_4_3' },
        { label: 'Portrait 16:9', id: 'portrait_16_9' },
        { label: 'Landscape 4:3', id: 'landscape_4_3' },
        { label: 'Landscape 16:9', id: 'landscape_16_9' },
      ],
      value: () => 'auto_2K',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'seedream-v4.5' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      options: [
        { label: 'Landscape 4:3', id: 'landscape_4_3' },
        { label: 'Landscape 16:9', id: 'landscape_16_9' },
        { label: 'Square HD', id: 'square_hd' },
        { label: 'Square', id: 'square' },
        { label: 'Portrait 4:3', id: 'portrait_4_3' },
        { label: 'Portrait 16:9', id: 'portrait_16_9' },
      ],
      value: () => 'landscape_4_3',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'flux-2-pro' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [...BASE_ASPECT_RATIO_OPTIONS, ...EXTREME_ASPECT_RATIO_OPTIONS],
      value: () => '1:1',
      condition: {
        field: 'provider',
        value: 'gemini',
        and: { field: 'model', value: 'gemini-3.1-flash-image-preview' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: BASE_ASPECT_RATIO_OPTIONS,
      value: () => '1:1',
      condition: {
        field: 'provider',
        value: 'gemini',
        and: {
          field: 'model',
          value: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
        },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        ...BASE_ASPECT_RATIO_OPTIONS,
        ...EXTREME_ASPECT_RATIO_OPTIONS,
      ],
      value: () => 'auto',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'nano-banana-2' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [{ label: 'Auto', id: 'auto' }, ...BASE_ASPECT_RATIO_OPTIONS],
      value: () => '1:1',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'nano-banana-pro' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: BASE_ASPECT_RATIO_OPTIONS,
      value: () => '1:1',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'nano-banana' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [
        { label: '1:1', id: '1:1' },
        { label: '16:9', id: '16:9' },
        { label: '9:16', id: '9:16' },
        { label: '4:3', id: '4:3' },
        { label: '3:2', id: '3:2' },
        { label: '2:3', id: '2:3' },
        { label: '3:4', id: '3:4' },
        { label: '2:1', id: '2:1' },
        { label: '1:2', id: '1:2' },
        { label: '20:9', id: '20:9' },
        { label: '9:20', id: '9:20' },
        { label: '19.5:9', id: '19.5:9' },
        { label: '9:19.5', id: '9:19.5' },
      ],
      value: () => '1:1',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'grok-imagine-image' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      options: [
        { label: '512', id: '512' },
        { label: '1K', id: '1K' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '1K',
      condition: {
        field: 'provider',
        value: 'gemini',
        and: { field: 'model', value: 'gemini-3.1-flash-image-preview' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      options: [
        { label: '1K', id: '1K' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '1K',
      condition: {
        field: 'provider',
        value: 'gemini',
        and: { field: 'model', value: 'gemini-3-pro-image-preview' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      options: [
        { label: '0.5K', id: '0.5K' },
        { label: '1K', id: '1K' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '1K',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'nano-banana-2' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      options: [
        { label: '1K', id: '1K' },
        { label: '2K', id: '2K' },
        { label: '4K', id: '4K' },
      ],
      value: () => '1K',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'nano-banana-pro' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      options: [
        { label: '1k', id: '1k' },
        { label: '2k', id: '2k' },
      ],
      value: () => '1k',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'grok-imagine-image' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'quality',
      title: 'Quality',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Low', id: 'low' },
        { label: 'Medium', id: 'medium' },
        { label: 'High', id: 'high' },
      ],
      value: () => 'auto',
      condition: { field: 'provider', value: 'openai' },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'quality',
      title: 'Quality',
      type: 'dropdown',
      options: [
        { label: 'High', id: 'high' },
        { label: 'Medium', id: 'medium' },
        { label: 'Low', id: 'low' },
      ],
      value: () => 'high',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'gpt-image-1.5' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'background',
      title: 'Background',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Transparent', id: 'transparent' },
        { label: 'Opaque', id: 'opaque' },
      ],
      value: () => 'auto',
      condition: {
        field: 'provider',
        value: ['openai', 'falai'],
        and: { field: 'model', value: ['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'] },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'background',
      title: 'Background',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Opaque', id: 'opaque' },
      ],
      value: () => 'auto',
      condition: {
        field: 'provider',
        value: 'openai',
        and: { field: 'model', value: 'gpt-image-2' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'outputFormat',
      title: 'Output Format',
      type: 'dropdown',
      options: OUTPUT_FORMAT_OPTIONS,
      value: () => 'png',
      condition: {
        field: 'provider',
        value: ['openai', 'falai'],
        and: {
          field: 'model',
          value: [
            'gpt-image-2',
            'gpt-image-1.5',
            'gpt-image-1',
            'gpt-image-1-mini',
            'nano-banana-2',
            'nano-banana-pro',
            'nano-banana',
            'grok-imagine-image',
          ],
        },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'outputFormat',
      title: 'Output Format',
      type: 'dropdown',
      options: [
        { label: 'JPEG', id: 'jpeg' },
        { label: 'PNG', id: 'png' },
      ],
      value: () => 'jpeg',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'flux-2-pro' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'moderation',
      title: 'Moderation',
      type: 'dropdown',
      options: [
        { label: 'Auto', id: 'auto' },
        { label: 'Low', id: 'low' },
      ],
      value: () => 'auto',
      condition: { field: 'provider', value: 'openai' },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'inputImage',
      title: 'Reference Images',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      multiple: true,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
      defaultValue: '<start.files>',
      condition: { field: 'provider', value: ['openai', 'gemini'] },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'inputImageUrl',
      title: 'Reference Image URLs',
      type: 'long-input',
      placeholder:
        'Optional: add one or more image URLs or references. One image edits, multiple images fuse.',
      mode: 'advanced',
      condition: { field: 'provider', value: ['openai', 'gemini'] },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'inputImages',
      title: 'Legacy Fusion Images',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      multiple: true,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
      hidden: true,
      condition: { field: 'provider', value: 'gemini' },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'inputImageUrls',
      title: 'Legacy Fusion Image URLs',
      type: 'long-input',
      placeholder:
        'Optional: enter fusion image URLs (one per line or comma-separated), or use a reference like <agent1.urls>.',
      hidden: true,
      condition: { field: 'provider', value: 'gemini' },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'safetyTolerance',
      title: 'Safety Tolerance',
      type: 'dropdown',
      options: [
        { label: '1', id: '1' },
        { label: '2', id: '2' },
        { label: '3', id: '3' },
        { label: '4', id: '4' },
        { label: '5', id: '5' },
        { label: '6', id: '6' },
      ],
      value: () => '4',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: ['nano-banana-2', 'nano-banana-pro', 'nano-banana'] },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'safetyTolerance',
      title: 'Safety Tolerance',
      type: 'dropdown',
      options: [
        { label: '1', id: '1' },
        { label: '2', id: '2' },
        { label: '3', id: '3' },
        { label: '4', id: '4' },
        { label: '5', id: '5' },
      ],
      value: () => '2',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'flux-2-pro' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'thinkingLevel',
      title: 'Thinking Level',
      type: 'dropdown',
      options: [
        { label: 'Minimal', id: 'minimal' },
        { label: 'High', id: 'high' },
      ],
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: 'nano-banana-2' },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'enableWebSearch',
      title: 'Web Search',
      type: 'switch',
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: ['nano-banana-2', 'nano-banana-pro'] },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'enableSafetyChecker',
      title: 'Safety Checker',
      type: 'switch',
      defaultValue: true,
      condition: {
        field: 'provider',
        value: 'falai',
        and: { field: 'model', value: ['seedream-v4.5', 'flux-2-pro'] },
      },
      dependsOn: ['provider', 'model'],
    },
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      required: { field: 'provider', value: 'falai' },
      placeholder: 'Enter your provider API key',
      password: true,
      connectionDroppable: false,
      hideWhenHosted: true,
      condition: { field: 'provider', value: ['falai', 'ideogram'] },
    },
    {
      id: 'remixImage',
      title: 'Remix Source Image',
      type: 'file-upload',
      acceptedTypes: 'image/png,image/jpeg,image/webp',
      multiple: false,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'remixImageUrl',
      title: 'Remix Source Image URL',
      type: 'long-input',
      placeholder: 'Optional: source image URL for Ideogram Remix',
      mode: 'advanced',
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'imageWeight',
      title: 'Image Weight',
      type: 'short-input',
      placeholder: 'Optional: leave blank for automatic',
      mode: 'advanced',
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'resolution',
      title: 'Resolution',
      type: 'dropdown',
      options: IDEOGRAM_RESOLUTION_OPTIONS,
      value: () => '2048x2048',
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'renderingSpeed',
      title: 'Rendering Speed',
      type: 'dropdown',
      options: IDEOGRAM_RENDERING_SPEED_OPTIONS,
      value: () => 'DEFAULT',
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
    {
      id: 'enableCopyrightDetection',
      title: 'Copyright Detection',
      type: 'switch',
      defaultValue: false,
      condition: { field: 'provider', value: 'ideogram' },
      dependsOn: ['provider'],
    },
  ],
  tools: {
    access: ['image_generate'],
    config: {
      tool: () => 'image_generate',
      params: (params) => {
        const provider = params.provider || 'openai'
        const defaultModel =
          provider === 'gemini'
            ? 'gemini-3.1-flash-image-preview'
            : provider === 'falai'
              ? 'nano-banana-2'
              : provider === 'ideogram'
                ? IDEOGRAM_V4_MODEL
                : 'gpt-image-1.5'

        if (provider === 'ideogram') {
          const jsonPrompt = parseIdeogramJsonPromptParam(params.jsonPrompt)
          const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : ''
          const remixImage = normalizeFileInput(params.remixImage, {
            single: true,
            errorMessage: 'Ideogram Remix supports one source image at a time',
          })
          const remixImageUrl =
            typeof params.remixImageUrl === 'string' && params.remixImageUrl.trim()
              ? params.remixImageUrl.trim()
              : undefined
          const hasRemixSource = Boolean(remixImage || remixImageUrl)
          if (!prompt && !jsonPrompt) {
            throw new Error('Either prompt or jsonPrompt is required for Ideogram generation')
          }
          if (prompt && jsonPrompt) {
            throw new Error('Provide either prompt or jsonPrompt for Ideogram, not both')
          }
          if (hasRemixSource && jsonPrompt) {
            throw new Error(
              'Ideogram Remix supports prompt text only. Use Prompt instead of JSON Prompt.'
            )
          }

          return {
            provider,
            model: params.model || defaultModel,
            apiKey: params.apiKey,
            ...(jsonPrompt ? { jsonPrompt } : { prompt }),
            ...(params.magicPrompt !== undefined && {
              magicPrompt: parseOptionalBooleanInput(params.magicPrompt),
            }),
            ...(remixImage && { remixImage }),
            ...(remixImageUrl && { remixImageUrl }),
            ...(params.imageWeight !== undefined &&
              params.imageWeight !== '' && { imageWeight: Number(params.imageWeight) }),
            ...(params.resolution && { resolution: params.resolution }),
            ...(params.renderingSpeed && { renderingSpeed: params.renderingSpeed }),
            ...(params.enableCopyrightDetection !== undefined && {
              enableCopyrightDetection: parseOptionalBooleanInput(params.enableCopyrightDetection),
            }),
          }
        }

        if (!params.prompt) {
          throw new Error('Prompt is required')
        }

        const referenceInputs =
          provider === 'openai' || provider === 'gemini'
            ? resolveNanoBananaReferences({
                model: params.model,
                uploadedReferences: [
                  ...normalizeReferenceFiles(params.inputImage),
                  ...normalizeReferenceFiles(params.inputImages),
                ],
                inputImageUrl: params.inputImageUrl,
                inputImageUrls: params.inputImageUrls,
              })
            : {}

        return {
          provider,
          model: params.model || defaultModel,
          prompt: params.prompt,
          apiKey: params.apiKey,
          ...(params.size && { size: params.size }),
          ...(params.aspectRatio && { aspectRatio: params.aspectRatio }),
          ...(params.resolution && { resolution: params.resolution }),
          ...(params.quality && { quality: params.quality }),
          ...(params.background && { background: params.background }),
          ...(params.outputFormat && { outputFormat: params.outputFormat }),
          ...(params.moderation && { moderation: params.moderation }),
          ...(params.safetyTolerance && { safetyTolerance: params.safetyTolerance }),
          ...(params.thinkingLevel && { thinkingLevel: params.thinkingLevel }),
          ...(params.inputImageMimeType && { inputImageMimeType: params.inputImageMimeType }),
          ...(referenceInputs.inputImageWarning && {
            inputImageWarning: referenceInputs.inputImageWarning,
          }),
          ...(referenceInputs.inputImages
            ? { inputImages: referenceInputs.inputImages }
            : referenceInputs.inputImage
              ? { inputImage: referenceInputs.inputImage }
              : {}),
          ...(params.enableWebSearch !== undefined && {
            enableWebSearch: parseOptionalBooleanInput(params.enableWebSearch),
          }),
          ...(params.enableSafetyChecker !== undefined && {
            enableSafetyChecker: parseOptionalBooleanInput(params.enableSafetyChecker),
          }),
        }
      },
    },
  },
  inputs: IMAGE_GENERATOR_V2_INPUTS,
  outputs: {
    content: { type: 'string', description: 'Generated image URL or identifier' },
    image: { type: 'file', description: 'Generated image file' },
    images: {
      type: 'array',
      description: 'All generated image files when multiple images were requested',
    },
    imageUrl: { type: 'string', description: 'Generated image URL' },
    provider: { type: 'string', description: 'Provider used' },
    model: { type: 'string', description: 'Model used' },
    metadata: { type: 'json', description: 'Generation metadata' },
  },
}

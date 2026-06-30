import { ImageIcon } from '@/components/icons'
import { resolveNanoBananaReferences } from '@/lib/image-generation/nano-banana-inputs'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode, IntegrationType } from '@/blocks/types'
import { normalizeFileInput } from '@/blocks/utils'
import { START_FILES_REF } from '@/executor/constants'
import type { ImageGenerationResponse } from '@/tools/image/types'

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

const GEMINI_IMAGE_MODELS = [
  { label: 'Nano Banana 2', id: 'gemini-3.1-flash-image-preview' },
  { label: 'Nano Banana Pro', id: 'gemini-3-pro-image-preview' },
  { label: 'Nano Banana', id: 'gemini-2.5-flash-image' },
]

const GEMINI_REFERENCE_IMAGE_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
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

export const ImageCreatorBlock: BlockConfig<ImageGenerationResponse> = {
  type: 'image_creator',
  name: 'Image Creator',
  description: 'Create, edit, or vary images with Gemini Nano Banana',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Create images with Google Gemini Nano Banana models. Interprets prompts to generate single images, separate variations, or edits using reference images.',
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
      options: [{ label: 'Google Gemini', id: 'gemini' }],
      value: () => 'gemini',
    },
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: GEMINI_IMAGE_MODELS,
      value: () => 'gemini-3.1-flash-image-preview',
    },
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      required: true,
      placeholder: 'Describe the image you want to create, edit, or vary...',
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: [...BASE_ASPECT_RATIO_OPTIONS, ...EXTREME_ASPECT_RATIO_OPTIONS],
      value: () => '1:1',
      condition: { field: 'model', value: 'gemini-3.1-flash-image-preview' },
      dependsOn: ['model'],
    },
    {
      id: 'aspectRatio',
      title: 'Aspect Ratio',
      type: 'dropdown',
      options: BASE_ASPECT_RATIO_OPTIONS,
      value: () => '1:1',
      condition: {
        field: 'model',
        value: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      },
      dependsOn: ['model'],
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
      condition: { field: 'model', value: 'gemini-3.1-flash-image-preview' },
      dependsOn: ['model'],
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
      condition: { field: 'model', value: 'gemini-3-pro-image-preview' },
      dependsOn: ['model'],
    },
    {
      id: 'inputImage',
      title: 'Reference Images',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      multiple: true,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
      defaultValue: START_FILES_REF,
      condition: { field: 'model', value: GEMINI_REFERENCE_IMAGE_MODELS },
      dependsOn: ['model'],
    },
    {
      id: 'inputImageUrl',
      title: 'Reference Image URLs',
      type: 'long-input',
      placeholder:
        'Optional: add one or more image URLs or references. One image edits; multiple images fuse on Nano Banana Pro.',
      mode: 'advanced',
      condition: { field: 'model', value: GEMINI_REFERENCE_IMAGE_MODELS },
      dependsOn: ['model'],
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
      dependsOn: ['model'],
    },
    {
      id: 'inputImageUrls',
      title: 'Legacy Fusion Image URLs',
      type: 'long-input',
      hidden: true,
      dependsOn: ['model'],
    },
  ],
  tools: {
    access: ['image_creator'],
    config: {
      tool: () => 'image_creator',
      params: (params) => {
        if (!params.prompt) {
          throw new Error('Prompt is required')
        }

        const model = params.model || 'gemini-3.1-flash-image-preview'
        const referenceInputs = resolveNanoBananaReferences({
          model: params.model,
          uploadedReferences: [
            ...normalizeReferenceFiles(params.inputImage),
            ...normalizeReferenceFiles(params.inputImages),
          ],
          inputImageUrl: params.inputImageUrl,
          inputImageUrls: params.inputImageUrls,
        })

        return {
          provider: 'gemini',
          model,
          prompt: params.prompt,
          ...(params.aspectRatio && { aspectRatio: params.aspectRatio }),
          ...(params.resolution && { resolution: params.resolution }),
          ...(referenceInputs.inputImageWarning && {
            inputImageWarning: referenceInputs.inputImageWarning,
          }),
          ...(referenceInputs.inputImages
            ? { inputImages: referenceInputs.inputImages }
            : referenceInputs.inputImage
              ? { inputImage: referenceInputs.inputImage }
              : {}),
        }
      },
    },
  },
  inputs: {
    provider: { type: 'string', description: 'Image generation provider (Google Gemini)' },
    prompt: { type: 'string', description: 'Image description prompt' },
    model: { type: 'string', description: 'Gemini Nano Banana model' },
    aspectRatio: { type: 'string', description: 'Image aspect ratio' },
    resolution: { type: 'string', description: 'Image resolution' },
    inputImage: {
      type: 'json',
      description:
        'Reference images as uploaded files, Start block files, or file references. One image edits; multiple images fuse on Nano Banana Pro.',
    },
    inputImageUrl: {
      type: 'string',
      description:
        'Reference image URLs or refs. One image edits; multiple images fuse on Nano Banana Pro.',
    },
    inputImages: {
      type: 'json',
      description: 'Multiple input images for Gemini Nano Banana Pro fusion.',
    },
    inputImageUrls: {
      type: 'string',
      description: 'Multiple image URLs or references for Gemini Nano Banana Pro fusion.',
    },
    inputImageWarning: {
      type: 'string',
      description:
        'Warning emitted when multiple input images were provided and the latest one was used.',
    },
  },
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

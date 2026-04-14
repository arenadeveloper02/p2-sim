import { ImageIcon } from '@/components/icons'
import { createVersionedToolSelector, normalizeFileInput } from '@/blocks/utils'
import { AuthMode, type BlockConfig, IntegrationType } from '@/blocks/types'
import { MAX_IMAGES_TO_GENERATE } from '@/lib/image-generation/constants'
import {
  NANO_BANANA_MODELS,
  NANO_BANANA_PRO_MODEL,
  resolveNanoBananaReferences,
} from '@/lib/image-generation/nano-banana-inputs'

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

export const P2ImageGeneratorBlockV2: BlockConfig = {
  type: 'image_generator',
  name: 'Image Generator',
  description: 'Generate, edit, or fuse images',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Integrate Image Generator into the workflow. Generate new images, edit a single reference image, or fuse multiple images in one Nano Banana Pro request. The block can return up to five images per run using the Images slider together with the SLM estimate of how many distinct outputs the prompt needs.',
  docsLink: 'https://docs.sim.ai/tools/image_generator',
  category: 'tools',
  integrationType: IntegrationType.AI,
  tags: ['image-generation', 'llm'],
  bgColor: '#4D5FFF',
  icon: ImageIcon,
  subBlocks: [
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      options: [
        { label: 'DALL-E 3', id: 'dall-e-3' },
        { label: 'Imagen 4.0', id: 'imagen-4.0-generate-001' },
        { label: 'Nano Banana', id: 'gemini-2.5-flash-image' },
        { label: 'Nano Banana Pro', id: NANO_BANANA_PRO_MODEL },
      ],
      value: () => 'dall-e-3',
    },
    {
      id: 'imageCount',
      title: 'Images / Variations',
      type: 'slider',
      min: 1,
      max: MAX_IMAGES_TO_GENERATE,
      integer: true,
      step: 1,
      defaultValue: 1,
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
      condition: { field: 'model', value: 'gemini-3-pro-image-preview' },
    },
    {
      id: 'inputImage',
      title: 'Reference Images',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      multiple: true,
      uploadContext: 'image-fusion',
      allowStartFilesReference: true,
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

        const imageCount = Math.min(
          MAX_IMAGES_TO_GENERATE,
          Math.max(1, Number(params.imageCount) || 1)
        )

        if (params.model?.startsWith('imagen-')) {
          return {
            model: params.model,
            prompt: params.prompt,
            imageSize: params.imageSize || '1K',
            aspectRatio: params.aspectRatio || '1:1',
            personGeneration: params.personGeneration || 'allow_adult',
            imageCount,
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
          const base = {
            model: params.model,
            prompt: params.prompt,
            aspectRatio: params.aspectRatio || '1:1',
            ...('inputImages' in nanoBananaReferences && nanoBananaReferences.inputImages
              ? { inputImages: nanoBananaReferences.inputImages }
              : {}),
            ...('inputImage' in nanoBananaReferences && nanoBananaReferences.inputImage
              ? { inputImage: nanoBananaReferences.inputImage }
              : {}),
            inputImageMimeType: params.inputImageMimeType,
            imageCount,
            ...(nanoBananaReferences.inputImageWarning
              ? { inputImageWarning: nanoBananaReferences.inputImageWarning }
              : {}),
          }
          if (params.model === 'gemini-3-pro-image-preview') {
            return { ...base, imageSize: params.imageSize || '1K' }
          }
          return base
        }

        const baseParams = {
          prompt: params.prompt,
          model: params.model || 'dall-e-3',
          size: params.size || '1024x1024',
          imageCount,
        }

        if (params.model === 'dall-e-3') {
          return {
            ...baseParams,
            quality: params.quality || 'standard',
            style: params.style || 'vivid',
          }
        }
        if (params.model === 'gpt-image-1') {
          return {
            ...baseParams,
            ...(params.background && { background: params.background }),
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
      description: 'Warning emitted when multiple input images were provided and the latest one was used',
    },
    imageCount: {
      type: 'number',
      description: 'Requested images (1–5); execution may combine with SLM estimate (capped at 5)',
    },
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

export const P2ImageGeneratorBlock = P2ImageGeneratorBlockV2

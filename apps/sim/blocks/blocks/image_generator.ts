import { ImageIcon } from '@/components/icons'
import { AuthMode, type BlockConfig, IntegrationType } from '@/blocks/types'
import type { DalleResponse } from '@/tools/openai/types'

export const ImageGeneratorBlock: BlockConfig<DalleResponse> = {
  type: 'image_generator',
  name: 'Image Generator',
  description: 'Generate images',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Integrate Image Generator into the workflow. Can generate images using DALL-E 3, GPT Image, Google Imagen, or Google Nano Banana.',
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
        // { label: 'GPT Image', id: 'gpt-image-1' },
        { label: 'Imagen 4.0', id: 'imagen-4.0-generate-001' },
        { label: 'Nano Banana', id: 'gemini-2.5-flash-image' },
        { label: 'Nano Banana Pro', id: 'gemini-3-pro-image-preview' },
        { label: 'GPT Image 1', id: 'gpt-image-1' },
        { label: 'GPT Image 2', id: 'gpt-image-2' },
      ],
      value: () => 'dall-e-3',
    },
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      required: true,
      placeholder: 'Describe the image you want to generate...',
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
      condition: { field: 'model', value: 'gemini-3-pro-image-preview' },
    },
    {
      id: 'inputImage',
      title: 'Input Image to Edit',
      type: 'file-upload',
      acceptedTypes: 'image/*',
      condition: {
        field: 'model',
        value: ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
      },
    },
  ],
  tools: {
    access: ['openai_image', 'google_imagen', 'google_nano_banana'],
    config: {
      tool: (params) => {
        // Select tool based on model
        if (params.model?.startsWith('imagen-')) {
          return 'google_imagen'
        }
        if (params.model?.startsWith('gemini-')) {
          return 'google_nano_banana'
        }
        return 'openai_image'
      },
      params: (params) => {
        if (!params.prompt) {
          throw new Error('Prompt is required')
        }

        // Handle Google Imagen models
        if (params.model?.startsWith('imagen-')) {
          return {
            model: params.model,
            prompt: params.prompt,
            imageSize: params.imageSize || '1K',
            aspectRatio: params.aspectRatio || '1:1',
            personGeneration: params.personGeneration || 'allow_adult',
          }
        }

        // Handle Google Nano Banana models
        if (params.model?.startsWith('gemini-')) {
          const base = {
            model: params.model,
            prompt: params.prompt,
            aspectRatio: params.aspectRatio || '1:1',
            inputImage: params.inputImage,
            inputImageMimeType: params.inputImageMimeType,
          }
          if (params.model === 'gemini-3-pro-image-preview') {
            return { ...base, imageSize: params.imageSize || '1K' }
          }
          return base
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
          model: params.model || 'dall-e-3',
          size: size,
          // apiKey: params.apiKey,
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
      type: 'string',
      description: 'Base64 encoded input image for editing (Google Nano Banana)',
    },
    inputImageMimeType: { type: 'string', description: 'MIME type of input image' },
    outputFormat: { type: 'string', description: 'Output image format (png, jpeg, webp)' },
    moderation: { type: 'string', description: 'Moderation level (auto or low)' },
    // apiKey: { type: 'string', description: 'OpenAI API key' },
  },
  outputs: {
    content: { type: 'string', description: 'Generation response' },
    image: { type: 'file', description: 'Generated image file (UserFile)' },
    metadata: { type: 'json', description: 'Generation metadata' },
  },
}

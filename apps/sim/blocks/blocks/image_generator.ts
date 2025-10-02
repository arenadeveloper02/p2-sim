import { ImageIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

interface ImageGeneratorResponse extends ToolResponse {
  output: {
    content: string
    image: string
    metadata: {
      model: string
      numberOfImages?: number
    }
  }
}

export const ImageGeneratorBlock: BlockConfig<ImageGeneratorResponse> = {
  type: 'image_generator',
  name: 'Image Generator',
  description: 'Generate images',
  longDescription:
    'Integrate Image Generator into the workflow. Can generate images using DALL-E 3, GPT Image, Google Imagen, or Google Nano Banana. Requires API Key.',
  docsLink: 'https://docs.sim.ai/tools/image_generator',
  category: 'tools',
  bgColor: '#4D5FFF',
  icon: ImageIcon,
  subBlocks: [
    {
      id: 'model',
      title: 'Model',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'DALL-E 3', id: 'dall-e-3' },
        { label: 'GPT Image', id: 'gpt-image-1' },
        { label: 'Google Imagen', id: 'imagen-4.0-generate-001' },
        { label: 'Google Nano Banana', id: 'gemini-2.5-flash-image' },
      ],
      value: () => 'dall-e-3',
    },
    {
      id: 'prompt',
      title: 'Prompt',
      type: 'long-input',
      layout: 'full',
      required: true,
      placeholder: 'Describe the image you want to generate...',
    },
    {
      id: 'size',
      title: 'Size',
      type: 'dropdown',
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      layout: 'half',
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
      condition: { field: 'model', value: 'gemini-2.5-flash-image' },
    },
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      layout: 'full',
      required: true,
      placeholder: 'Enter your API key (OpenAI or Google)',
      password: true,
      connectionDroppable: false,
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
        if (!params.apiKey) {
          throw new Error('API key is required')
        }
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
            apiKey: params.apiKey,
          }
        }

        // Handle Google Nano Banana models
        if (params.model?.startsWith('gemini-')) {
          return {
            model: params.model,
            prompt: params.prompt,
            aspectRatio: params.aspectRatio || '1:1',
            apiKey: params.apiKey,
          }
        }

        // Handle OpenAI models
        const baseParams = {
          prompt: params.prompt,
          model: params.model || 'dall-e-3',
          size: params.size || '1024x1024',
          apiKey: params.apiKey,
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
    size: { type: 'string', description: 'Image dimensions (OpenAI models)' },
    imageSize: { type: 'string', description: 'Image size (Google Imagen models)' },
    quality: { type: 'string', description: 'Image quality level' },
    style: { type: 'string', description: 'Image style' },
    background: { type: 'string', description: 'Background type' },
    aspectRatio: { type: 'string', description: 'Image aspect ratio' },
    personGeneration: { type: 'string', description: 'Person generation setting' },
    apiKey: { type: 'string', description: 'API key (OpenAI or Google)' },
  },
  outputs: {
    content: { type: 'string', description: 'Generation response' },
    image: { type: 'string', description: 'Generated image URL' },
    metadata: { type: 'json', description: 'Generation metadata' },
  },
}

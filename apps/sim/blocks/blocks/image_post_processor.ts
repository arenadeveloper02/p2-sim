import { ImageIcon } from '@/components/icons'
import {
  buildPostProcessorToolParams,
  IDEOGRAM_POST_PROCESSOR_SUB_BLOCKS,
  IDEOGRAM_POST_PROCESSOR_TOOL_IDS,
  resolvePostProcessorToolId,
} from '@/lib/image-generation/ideogram-post-processor-fields'
import { AuthMode, type BlockConfig, IntegrationType } from '@/blocks/types'

/**
 * Post-processes an existing image with Ideogram utilities
 * (describe, layerize text, reframe, remove background, upscale).
 */
export const ImagePostProcessorBlock: BlockConfig = {
  type: 'image_post_processor',
  name: 'Image Post Processor',
  description: 'Describe, layerize, reframe, remove background, or upscale an image',
  authMode: AuthMode.ApiKey,
  longDescription:
    'Apply Ideogram post-processing to an existing image: reverse-prompt with Describe, extract typography layers with Layerize Text, change canvas size with Reframe, cut out with Remove Background, or Upscale for delivery.',
  docsLink: 'https://docs.sim.ai/integrations/image_generator',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  bgColor: '#4D5FFF',
  icon: ImageIcon,
  subBlocks: IDEOGRAM_POST_PROCESSOR_SUB_BLOCKS,
  tools: {
    access: [...IDEOGRAM_POST_PROCESSOR_TOOL_IDS],
    config: {
      tool: (params) => resolvePostProcessorToolId(params),
      params: (params) => buildPostProcessorToolParams(params),
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Post-process operation' },
    apiKey: { type: 'string', description: 'Ideogram API key' },
    image: { type: 'file', description: 'Image to post-process' },
    imageUrl: {
      type: 'string',
      description: 'Public image URL alternative to file upload',
    },
    resolution: { type: 'string', description: 'Target resolution for Reframe' },
    renderingSpeed: { type: 'string', description: 'Rendering speed for Reframe' },
    includeBbox: { type: 'boolean', description: 'Include bounding boxes for Describe' },
    prompt: { type: 'string', description: 'Optional prompt for Layerize Text or Upscale' },
    seed: { type: 'number', description: 'Optional seed' },
  },
  outputs: {
    content: { type: 'string', description: 'Primary result URL or identifier' },
    image: { type: 'file', description: 'Processed image file' },
    images: { type: 'array', description: 'Processed image files' },
    imageUrl: { type: 'string', description: 'Processed image URL' },
    imageUrls: { type: 'array', description: 'Processed image URLs' },
    jsonPrompt: { type: 'json', description: 'Structured prompt from Describe' },
    baseImageUrl: { type: 'string', description: 'Text-erased base image from Layerize Text' },
    originalImageUrl: { type: 'string', description: 'Original image URL from Layerize Text' },
    textBlocks: {
      type: 'array',
      description: 'Detected text layers from Layerize Text',
    },
    seed: { type: 'number', description: 'Seed used' },
    created: { type: 'string', description: 'Request creation timestamp' },
    s3UploadFailed: {
      type: 'boolean',
      description: 'True when image was saved locally because S3 upload failed',
    },
  },
}

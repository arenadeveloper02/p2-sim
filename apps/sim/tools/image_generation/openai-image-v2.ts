import { openAIImageTool } from '@/tools/openai'
import { createImageGenerationWrapperTool } from '@/tools/image_generation/utils'

export const openAIImageV2Tool = createImageGenerationWrapperTool({
  baseTool: openAIImageTool,
  baseToolId: 'openai_image',
  id: 'openai_image_v2',
  name: 'Image Generator',
})

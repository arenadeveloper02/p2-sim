import { nanoBananaTool } from '@/tools/google'
import { createImageGenerationWrapperTool } from '@/tools/image_generation/utils'

export const googleNanoBananaV2Tool = createImageGenerationWrapperTool({
  baseTool: nanoBananaTool,
  baseToolId: 'google_nano_banana',
  id: 'google_nano_banana_v2',
  name: 'Google Nano Banana',
})

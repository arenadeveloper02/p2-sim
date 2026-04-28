import { imagenTool } from '@/tools/google'
import { createImageGenerationWrapperTool } from '@/tools/image_generation/utils'

export const googleImagenV2Tool = createImageGenerationWrapperTool({
  baseTool: imagenTool,
  baseToolId: 'google_imagen',
  id: 'google_imagen_v2',
  name: 'Google Imagen',
})

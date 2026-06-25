/** Maps v2 image-generation wrapper tool ids to their base execution tools. */
export const IMAGE_GENERATION_WRAPPER_TOOL_IDS = {
  openai_image_v2: 'openai_image',
  google_imagen_v2: 'google_imagen',
  google_nano_banana_v2: 'google_nano_banana',
} as const

export type ImageGenerationWrapperToolId = keyof typeof IMAGE_GENERATION_WRAPPER_TOOL_IDS
export type ImageGenerationWrapperBaseToolId =
  (typeof IMAGE_GENERATION_WRAPPER_TOOL_IDS)[ImageGenerationWrapperToolId]

/**
 * Resolves a v2 image-generation wrapper tool id to its base tool id.
 */
export function getImageGenerationWrapperBaseToolId(
  toolId: string
): ImageGenerationWrapperBaseToolId | undefined {
  if (toolId in IMAGE_GENERATION_WRAPPER_TOOL_IDS) {
    return IMAGE_GENERATION_WRAPPER_TOOL_IDS[toolId as ImageGenerationWrapperToolId]
  }

  return undefined
}

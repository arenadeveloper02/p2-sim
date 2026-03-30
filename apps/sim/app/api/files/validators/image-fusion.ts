/**
 * Validator for Image Fusion block uploads.
 * Accepts all common image file extensions for multi-image fusion (Nano Banana Pro).
 */

export const IMAGE_FUSION_ALLOWED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'tiff',
  'tif',
  'apng',
  'avif',
  'heic',
  'heif',
])

/**
 * Validates that the file extension is allowed for Image Fusion uploads.
 *
 * @param filename - Original file name (with or without path).
 * @returns True if the extension is in the allowed image list.
 */
export function validateImageFusionFileExtension(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase()
  if (!extension) return false
  return IMAGE_FUSION_ALLOWED_EXTENSIONS.has(extension)
}

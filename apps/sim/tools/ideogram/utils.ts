import type { IdeogramImageObject } from '@/tools/ideogram/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Maps a raw Ideogram image object into the camelCase tool output shape.
 */
export function mapIdeogramImageObject(raw: unknown): IdeogramImageObject {
  if (!isRecord(raw)) {
    return {
      url: null,
      prompt: null,
      resolution: null,
      upscaledResolution: null,
      isImageSafe: false,
      seed: null,
      styleType: null,
    }
  }

  return {
    url: typeof raw.url === 'string' ? raw.url : null,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : null,
    resolution: typeof raw.resolution === 'string' ? raw.resolution : null,
    upscaledResolution:
      typeof raw.upscaled_resolution === 'string' ? raw.upscaled_resolution : null,
    isImageSafe: raw.is_image_safe === true,
    seed: typeof raw.seed === 'number' ? raw.seed : null,
    styleType: typeof raw.style_type === 'string' ? raw.style_type : null,
  }
}

/**
 * Extracts image objects and non-null URLs from an Ideogram `data` array.
 */
export function mapIdeogramImages(data: unknown): {
  images: IdeogramImageObject[]
  imageUrls: string[]
} {
  const images = Array.isArray(data) ? data.map(mapIdeogramImageObject) : []
  const imageUrls = images
    .map((image) => image.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
  return { images, imageUrls }
}

/**
 * Parses optional JSON tool params that may arrive as objects or JSON strings.
 */
export function parseJsonParam(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

/**
 * Appends a scalar or JSON-serialized value to FormData when defined.
 */
export function appendFormField(
  form: FormData,
  key: string,
  value: unknown,
  options?: { json?: boolean }
): void {
  if (value === undefined || value === null || value === '') {
    return
  }

  if (options?.json || typeof value === 'object') {
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value))
    return
  }

  form.append(key, String(value))
}

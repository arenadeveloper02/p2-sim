import type { createLogger } from '@sim/logger'
import type { ImageToolBody } from '@/lib/api/contracts/tools/media/image'
import {
  IDEOGRAM_DEFAULT_RENDERING_SPEED,
  IDEOGRAM_DEFAULT_RESOLUTION,
  IDEOGRAM_V4_MODEL,
} from '@/lib/ideogram/constants'
import { isIdeogramRenderingSpeed, isIdeogramV4Resolution } from '@/lib/ideogram/validation'
import type { IdeogramV4JsonPrompt } from '@/lib/ideogram/types'
import {
  DEFAULT_MAX_ERROR_BODY_BYTES,
  readResponseJsonWithLimit,
  readResponseTextWithLimit,
} from '@/lib/core/utils/stream-limits'

const MAX_IDEOGRAM_JSON_BYTES = 2 * 1024 * 1024

export interface IdeogramGeneratedImageResult {
  buffer: Buffer
  contentType: string
  fileName: string
  provider: 'ideogram'
  model: string
  sourceUrl?: string
  revisedPrompt?: string
  seed?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getNumberProperty(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  return 'png'
}

function parseJsonPrompt(body: ImageToolBody): IdeogramV4JsonPrompt | null {
  const raw = (body as Record<string, unknown>).jsonPrompt
  if (raw === undefined || raw === null || raw === '') return null

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return isRecord(parsed) ? (parsed as IdeogramV4JsonPrompt) : null
    } catch {
      throw new Error('jsonPrompt must be valid JSON')
    }
  }

  if (isRecord(raw)) {
    return raw as IdeogramV4JsonPrompt
  }

  throw new Error('jsonPrompt must be a JSON object or JSON string')
}

async function bufferFromImageUrl(
  url: string,
  bufferFromUrl: (url: string) => Promise<{ buffer: Buffer; contentType: string }>
): Promise<{ buffer: Buffer; contentType: string }> {
  return bufferFromUrl(url)
}

export async function generateWithIdeogram(
  apiKey: string,
  body: ImageToolBody,
  requestId: string,
  logger: ReturnType<typeof createLogger>,
  bufferFromUrl: (url: string) => Promise<{ buffer: Buffer; contentType: string }>
): Promise<IdeogramGeneratedImageResult> {
  const model = body.model || IDEOGRAM_V4_MODEL
  const jsonPrompt = parseJsonPrompt(body)
  const textPrompt = body.prompt?.trim() ?? ''

  if (jsonPrompt && textPrompt) {
    throw new Error('Provide either prompt (text_prompt) or jsonPrompt, not both')
  }
  if (!jsonPrompt && !textPrompt) {
    throw new Error('Either prompt or jsonPrompt is required for Ideogram generation')
  }

  const resolution =
    body.resolution && isIdeogramV4Resolution(body.resolution)
      ? body.resolution
      : IDEOGRAM_DEFAULT_RESOLUTION

  const renderingSpeedRaw = (body as Record<string, unknown>).renderingSpeed
  const renderingSpeed =
    typeof renderingSpeedRaw === 'string' && isIdeogramRenderingSpeed(renderingSpeedRaw)
      ? renderingSpeedRaw
      : IDEOGRAM_DEFAULT_RENDERING_SPEED

  const enableCopyrightDetection = (body as Record<string, unknown>).enableCopyrightDetection

  const formData = new FormData()
  if (jsonPrompt) {
    formData.append('json_prompt', JSON.stringify(jsonPrompt))
  } else {
    formData.append('text_prompt', textPrompt)
  }
  formData.append('resolution', resolution)
  formData.append('rendering_speed', renderingSpeed)
  if (enableCopyrightDetection !== undefined && enableCopyrightDetection !== null) {
    formData.append('enable_copyright_detection', String(enableCopyrightDetection))
  }

  logger.info(`[${requestId}] Calling Ideogram v4 generate`, {
    model,
    resolution,
    renderingSpeed,
    usesJsonPrompt: Boolean(jsonPrompt),
  })

  const response = await fetch('https://api.ideogram.ai/v1/ideogram-v4/generate', {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await readResponseTextWithLimit(response, {
      maxBytes: DEFAULT_MAX_ERROR_BODY_BYTES,
      label: 'Ideogram error response',
    }).catch(() => '')

    if (response.status === 422) {
      try {
        const parsed = JSON.parse(errorText) as { error?: string }
        throw new Error(parsed.error || 'Ideogram rejected the prompt for safety reasons')
      } catch {
        throw new Error('Ideogram rejected the prompt for safety reasons')
      }
    }

    throw new Error(`Ideogram API error: ${response.status} - ${errorText || 'Unknown error'}`)
  }

  const responseData = await readResponseJsonWithLimit(response, {
    maxBytes: MAX_IDEOGRAM_JSON_BYTES,
    label: 'Ideogram generate response',
  })

  if (!isRecord(responseData)) {
    throw new Error('Invalid Ideogram API response')
  }

  const data = responseData.data
  if (!Array.isArray(data) || data.length === 0 || !isRecord(data[0])) {
    throw new Error('Ideogram API response missing image data')
  }

  const first = data[0]
  const isImageSafe = first.is_image_safe
  const imageUrl = getStringProperty(first, 'url')
  const revisedPrompt = getStringProperty(first, 'prompt')
  const seed = getNumberProperty(first, 'seed')

  if (isImageSafe === false || !imageUrl) {
    throw new Error(
      'Ideogram did not return an image. The prompt may have failed safety checks (is_image_safe=false).'
    )
  }

  const downloaded = await bufferFromImageUrl(imageUrl, bufferFromUrl)
  const contentType = downloaded.contentType || 'image/png'
  const fileName = `ideogram-${model}-${Date.now()}.${extensionFromContentType(contentType)}`

  return {
    buffer: downloaded.buffer,
    contentType,
    fileName,
    provider: 'ideogram',
    model,
    sourceUrl: imageUrl,
    revisedPrompt,
    seed,
  }
}

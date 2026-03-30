import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { buildGenerateContentUrl, buildNanoBananaRequestBody } from '@/app/api/google/api-service'

export const runtime = 'nodejs'

/** Allow up to 5 minutes for image generation (same as image-generator; 4K/fusion can be slow). */
export const maxDuration = 300

const logger = createLogger('GoogleNanoBananaApi')

/** Timeout for the outgoing request to Google – match maxDuration so we never abort before the route is killed. */
const GOOGLE_API_TIMEOUT_MS = 5 * 60 * 1000

/**
 * POST /api/google
 *
 * Generate an image using Google's Gemini (Nano Banana) model.
 *
 * Request body (application/json):
 * - model: string (required) - Gemini image model (gemini-2.5-flash-image or gemini-3-pro-image-preview)
 * - prompt: string (required) - Text description for the image
 * - aspectRatio: string (optional) - e.g., 1:1, 16:9
 * - imageSize: string (optional) - For Pro only: 1K, 2K, 4K
 * - inputImage: string | { path: string; type?: string } (optional) - base64 image or file reference
 * - inputImageMimeType: string (optional) - MIME type for the input image
 * - inputImages: array (optional) - multiple images for fusion (Nano Banana Pro)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const model = body.model as string
    const prompt = body.prompt as string
    const aspectRatio = body.aspectRatio as string | undefined
    const imageSize = body.imageSize as string | undefined
    const inputImage = body.inputImage as unknown
    const inputImageMimeType = body.inputImageMimeType as string | undefined
    const inputImages = Array.isArray(body.inputImages) ? body.inputImages : undefined

    if (!model || !prompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: model and prompt are required',
        },
        { status: 400 }
      )
    }

    const apiKey = getRotatingApiKey('google')
    const url = buildGenerateContentUrl(model)
    const requestBody = await buildNanoBananaRequestBody({
      prompt,
      aspectRatio,
      imageSize,
      inputImage,
      inputImageMimeType,
      inputImages,
    })

    const imageCount = inputImages?.length ?? (inputImage ? 1 : 0)
    logger.info('Sending Nano Banana request', {
      model,
      aspectRatio,
      imageCount,
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GOOGLE_API_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Nano Banana API error: ${response.status} ${response.statusText}`
      try {
        const errJson = JSON.parse(errorText) as { error?: { message?: string } }
        if (errJson?.error?.message) {
          errorMessage = `Nano Banana API error: ${errJson.error.message}`
          if (errJson.error.message.toLowerCase().includes('deadline')) {
            errorMessage +=
              '. Try using Resolution 1K, fewer input images, or smaller images for fusion.'
          }
        }
      } catch {
        if (errorText) errorMessage += ` - ${errorText.slice(0, 500)}`
      }
      logger.error('Nano Banana API error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      })
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          details: errorText,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    logger.info('Nano Banana API success', data)

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    logger.error('Unhandled Nano Banana API error', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/google
 *
 * API documentation for Nano Banana image generation.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/google',
    method: 'POST',
    description: 'Generate an image using Google Gemini (Nano Banana)',
    contentType: 'application/json',
    requiredFields: {
      model: 'string - Gemini image model (gemini-2.5-flash-image or gemini-3-pro-image-preview)',
      prompt: 'string - Text description for the image',
    },
    optionalFields: {
      aspectRatio: 'string - Aspect ratio (1:1, 16:9, etc.)',
      imageSize: 'string - For Pro only: 1K, 2K, 4K',
      inputImage: 'string | { path: string; type?: string } - Base64 image or file reference',
      inputImageMimeType: 'string - MIME type of the input image',
      inputImages:
        'array - Multiple images for fusion (Nano Banana Pro); each item: base64 string or { path, type? }',
    },
    response: {
      success: 'boolean',
      data: 'object - Raw response from Google Generative Language API',
      error: 'string - Error message when unsuccessful',
    },
  })
}

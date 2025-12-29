import { type NextRequest, NextResponse } from 'next/server'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { createLogger } from '@sim/logger'
import { buildGenerateContentUrl, buildNanoBananaRequestBody } from '@/app/api/google/api-service'

export const runtime = 'nodejs'

const logger = createLogger('GoogleNanoBananaApi')

/**
 * POST /api/google
 *
 * Generate an image using Google's Gemini (Nano Banana) model.
 *
 * Request body (application/json):
 * - model: string (required) - Gemini image model (e.g., gemini-2.5-flash-image)
 * - prompt: string (required) - Text description for the image
 * - aspectRatio: string (optional) - e.g., 1:1, 16:9
 * - inputImage: string | { path: string; type?: string } (optional) - base64 image or file reference
 * - inputImageMimeType: string (optional) - MIME type for the input image
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const model = body.model as string
    const prompt = body.prompt as string
    const aspectRatio = body.aspectRatio as string | undefined
    const inputImage = body.inputImage as unknown
    const inputImageMimeType = body.inputImageMimeType as string | undefined

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
      inputImage,
      inputImageMimeType,
    })

    logger.info('Sending Nano Banana request', { model, aspectRatio, hasImage: !!inputImage })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Nano Banana API error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      })
      return NextResponse.json(
        {
          success: false,
          error: `Nano Banana API error: ${response.status} ${response.statusText}`,
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
      model: 'string - Gemini image model (e.g., gemini-2.5-flash-image)',
      prompt: 'string - Text description for the image',
    },
    optionalFields: {
      aspectRatio: 'string - Aspect ratio (1:1, 16:9, etc.)',
      inputImage: 'string | { path: string; type?: string } - Base64 image or file reference',
      inputImageMimeType: 'string - MIME type of the input image',
    },
    response: {
      success: 'boolean',
      data: 'object - Raw response from Google Generative Language API',
      error: 'string - Error message when unsuccessful',
    },
  })
}

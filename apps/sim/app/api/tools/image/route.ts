import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { imageProxyQuerySchema, imageToolContract } from '@/lib/api/contracts/tools/media/image'
import {
  getValidationErrorMessage,
  parseRequest,
  searchParamsToObject,
  validationErrorResponse,
} from '@/lib/api/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'
import { generateRequestId } from '@/lib/core/utils/request'
import {
  consumeOrCancelBody,
  isPayloadSizeLimitError,
  readResponseToBufferWithLimit,
} from '@/lib/core/utils/stream-limits'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { runImageToolGeneration } from '@/lib/image-generation/run-image-tool.server'

const logger = createLogger('ImageProxyAPI')
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export const dynamic = 'force-dynamic'
/**
 * Mirrors the maximum plan execution timeout (enterprise async, 90 minutes) used by
 * `getMaxExecutionTimeout()` for the provider polling loop below. Next.js requires a
 * static literal for `maxDuration`, so this value must be kept in sync with that source.
 */
export const maxDuration = 5400

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()
  logger.info(`[${requestId}] Image generation request started`)

  try {
    const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(
      imageToolContract,
      request,
      {},
      {
        validationErrorResponse: (error) => {
          logger.warn(`[${requestId}] Invalid image generation request:`, error.issues)
          return validationErrorResponse(
            error,
            getValidationErrorMessage(error, 'Invalid request data')
          )
        },
      }
    )
    if (!parsed.success) return parsed.response

    const body = parsed.data.body

    try {
      const storedImage = await runImageToolGeneration(body, {
        userId: authResult.userId,
        requestId,
      })
      return NextResponse.json(storedImage)
    } catch (error) {
      logger.error(`[${requestId}] Image generation failed:`, error)
      const errorMessage = getErrorMessage(error, 'Image generation failed')
      return NextResponse.json(
        { error: errorMessage },
        { status: isPayloadSizeLimitError(error) ? 413 : 500 }
      )
    }
  } catch (error) {
    logger.error(`[${requestId}] Image generation route error:`, error)
    const errorMessage = getErrorMessage(error, 'Unknown error')
    return NextResponse.json(
      { error: errorMessage },
      { status: isPayloadSizeLimitError(error) ? 413 : 500 }
    )
  }
})

/**
 * Proxy for fetching images
 * This allows client-side requests to fetch images from various sources while avoiding CORS issues
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!authResult.success) {
    logger.error(`[${requestId}] Authentication failed for image proxy:`, authResult.error)
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const queryResult = imageProxyQuerySchema.safeParse(
    searchParamsToObject(request.nextUrl.searchParams)
  )
  if (!queryResult.success) {
    const error = getValidationErrorMessage(queryResult.error, 'Missing URL parameter')
    logger.error(`[${requestId}] ${error}`)
    return new NextResponse(error, { status: 400 })
  }
  const { url: imageUrl } = queryResult.data

  const urlValidation = await validateUrlWithDNS(imageUrl, 'imageUrl')
  if (!urlValidation.isValid) {
    logger.warn(`[${requestId}] Blocked image proxy request`, {
      url: imageUrl.substring(0, 100),
      error: urlValidation.error,
    })
    return new NextResponse(urlValidation.error || 'Invalid image URL', { status: 403 })
  }

  logger.info(`[${requestId}] Proxying image request for: ${imageUrl}`)

  try {
    const imageResponse = await secureFetchWithPinnedIP(imageUrl, urlValidation.resolvedIP!, {
      method: 'GET',
      maxResponseBytes: MAX_IMAGE_BYTES,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: 'https://sim.ai/',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
    })

    if (!imageResponse.ok) {
      await consumeOrCancelBody(imageResponse)
      logger.error(`[${requestId}] Image fetch failed:`, {
        status: imageResponse.status,
        statusText: imageResponse.statusText,
      })
      return new NextResponse(`Failed to fetch image: ${imageResponse.statusText}`, {
        status: imageResponse.status,
      })
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    const imageBuffer = await readResponseToBufferWithLimit(imageResponse, {
      maxBytes: MAX_IMAGE_BYTES,
      label: 'image proxy response',
    })

    if (imageBuffer.length === 0) {
      logger.error(`[${requestId}] Empty image received`)
      return new NextResponse('Empty image received', { status: 404 })
    }

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    const errorMessage = toError(error).message
    logger.error(`[${requestId}] Image proxy error:`, { error: errorMessage })

    return new NextResponse(`Failed to proxy image: ${errorMessage}`, {
      status: isPayloadSizeLimitError(error) ? 413 : 500,
    })
  }
})

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import {
  executeIdeogramOperation,
  toIdeogramProxyErrorMessage,
} from '@/app/api/tools/ideogram/server-utils'
import {
  ideogramPostProcessContract,
  type IdeogramProxyBody,
} from '@/lib/api/contracts/tools/ideogram'
import { parseRequest } from '@/lib/api/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { downloadFile } from '@/lib/uploads/core/storage-service'
import { extractStorageKey, isInternalFileUrl } from '@/lib/uploads/utils/file-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

const logger = createLogger('IdeogramPostProcessAPI')

/**
 * Returns true when the key is an agent-generated image owned by the given user.
 * Path shape: agent-generated-images/[workflow_id]/[user_id]/[image]
 */
function isOwnedAgentGeneratedImage(key: string, userId: string): boolean {
  const parts = key.split('/')
  return (
    parts.length >= 4 &&
    parts[0] === 'agent-generated-images' &&
    typeof parts[2] === 'string' &&
    parts[2] === userId
  )
}

function mimeTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized Ideogram post-process request: ${authResult.error}`)
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication required' },
        { status: 401 }
      )
    }

    const parsed = await parseRequest(ideogramPostProcessContract, request, {})
    if (!parsed.success) return parsed.response

    const body = parsed.data.body
    const imageUrl = body.imageUrl.trim()

    if (!isInternalFileUrl(imageUrl)) {
      logger.warn(`[${requestId}] Rejected non-internal imageUrl for post-process`)
      return NextResponse.json(
        {
          success: false,
          error:
            'Only stored workspace images can be post-processed. Generate or upload the image first.',
        },
        { status: 400 }
      )
    }

    const key = extractStorageKey(imageUrl)
    if (!isOwnedAgentGeneratedImage(key, authResult.userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have access to this image.',
        },
        { status: 403 }
      )
    }

    const fileName = key.split('/').pop() || 'image.png'
    const buffer = await downloadFile({
      key,
      context: 'agent-generated-images',
    })

    const proxyBody: IdeogramProxyBody = {
      operation: body.operation,
      ...(body.apiKey ? { apiKey: body.apiKey } : {}),
      ...(body.resolution ? { resolution: body.resolution } : {}),
      ...(body.includeBbox !== undefined ? { includeBbox: body.includeBbox } : {}),
      ...(body.prompt ? { prompt: body.prompt } : {}),
      ...(body.seed !== undefined ? { seed: body.seed } : {}),
    }

    const workflowId =
      body.workflowId?.trim() ||
      request.nextUrl.searchParams.get('workflowId')?.trim() ||
      key.split('/')[1] ||
      'unknown'

    const output = await executeIdeogramOperation(
      proxyBody,
      authResult.userId,
      requestId,
      workflowId,
      {
        preResolvedImage: {
          buffer,
          fileName,
          mimeType: mimeTypeFromFileName(fileName),
        },
      }
    )

    return NextResponse.json({
      success: true,
      output,
    })
  } catch (error) {
    logger.error(`[${requestId}] Ideogram post-process error`, error)
    return NextResponse.json(
      { success: false, error: toIdeogramProxyErrorMessage(error) },
      { status: 500 }
    )
  }
})

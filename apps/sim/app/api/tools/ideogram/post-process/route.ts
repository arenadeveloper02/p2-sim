import { createHash } from 'node:crypto'
import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
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
import { recordUsage } from '@/lib/billing/core/usage-log'
import { getCostMultiplier } from '@/lib/core/config/env-flags'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import type { IdeogramPostProcessorOperation } from '@/lib/image-generation/ideogram-post-processor-fields'
import { getIdeogramPostProcessRawCost } from '@/lib/image-generation/ideogram-pricing'
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

function extractResultImageUrl(output: Record<string, unknown>): string | undefined {
  if (typeof output.baseImageUrl === 'string' && output.baseImageUrl) return output.baseImageUrl
  if (typeof output.imageUrl === 'string' && output.imageUrl) return output.imageUrl
  if (Array.isArray(output.imageUrls) && typeof output.imageUrls[0] === 'string') {
    return output.imageUrls[0]
  }
  if (typeof output.content === 'string' && output.content.startsWith('http')) {
    return output.content
  }
  return undefined
}

async function resolveWorkflowWorkspaceId(workflowId: string): Promise<string | undefined> {
  if (!workflowId || workflowId === 'unknown') return undefined
  const [row] = await db
    .select({ workspaceId: workflow.workspaceId })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)
  return row?.workspaceId ?? undefined
}

/**
 * Records a follow-on usage_log row for chat ⋯ post-process (separate from the
 * original workflow completion ledger).
 */
async function recordPostProcessUsage(params: {
  userId: string
  workflowId: string
  workspaceId?: string
  operation: IdeogramPostProcessorOperation
  requestId: string
  byok: boolean
  renderingSpeed?: string
  resultImageUrl?: string
}): Promise<void> {
  const rawCost = getIdeogramPostProcessRawCost(params.operation, {
    byok: params.byok,
    renderingSpeed: params.renderingSpeed,
  })
  const billableCost = rawCost > 0 ? rawCost * getCostMultiplier() : 0
  const toolId = `ideogram_${params.operation}`
  const eventKey = createHash('sha256')
    .update(
      [
        'image-post-process',
        params.userId,
        params.workflowId,
        params.operation,
        params.requestId,
        params.resultImageUrl ?? '',
      ].join(':')
    )
    .digest('hex')

  await recordUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId !== 'unknown' ? params.workflowId : undefined,
    entries: [
      {
        category: 'tool',
        source: 'image-post-process',
        description: `Ideogram ${params.operation.replace(/_/g, ' ')}`,
        cost: billableCost,
        rawCost,
        billableCost,
        eventKey,
        vendor: 'ideogram',
        toolId,
        quantity: 1,
        unit: 'image',
        pricingSnapshot: {
          vendor: 'ideogram',
          tool: toolId,
          flatRate: rawCost,
          multiplier: getCostMultiplier(),
          pricingSource: 'fixed',
          capturedAt: new Date().toISOString(),
          ...(params.renderingSpeed ? { renderingSpeed: params.renderingSpeed } : {}),
        },
        metadata: {
          operation: params.operation,
          byok: params.byok,
          ...(params.renderingSpeed ? { renderingSpeed: params.renderingSpeed } : {}),
          ...(params.resultImageUrl ? { resultImageUrl: params.resultImageUrl } : {}),
        },
      },
    ],
  })
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
      ...(body.renderingSpeed ? { renderingSpeed: body.renderingSpeed } : {}),
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

    const workspaceId = await resolveWorkflowWorkspaceId(workflowId).catch((error) => {
      logger.warn(`[${requestId}] Failed to resolve workspace for post-process usage`, {
        error,
        workflowId,
        operation: body.operation,
      })
      return undefined
    })

    const resultImageUrl = extractResultImageUrl(output as Record<string, unknown>)
    logger.info(`[${requestId}] Ideogram post-process succeeded; recording usage`, {
      operation: body.operation,
      workflowId,
      workspaceId,
      userId: authResult.userId,
      byok: Boolean(body.apiKey?.trim()),
      hasResultImageUrl: Boolean(resultImageUrl),
      resultImagePreview: resultImageUrl?.slice(0, 120),
      outputKeys: Object.keys(output as Record<string, unknown>),
    })

    if (!workspaceId) {
      logger.warn(`[${requestId}] Post-process usage will omit workspaceId`, {
        workflowId,
        operation: body.operation,
        userId: authResult.userId,
      })
    }

    try {
      await recordPostProcessUsage({
        userId: authResult.userId,
        workflowId,
        workspaceId,
        operation: body.operation,
        requestId,
        byok: Boolean(body.apiKey?.trim()),
        renderingSpeed: body.renderingSpeed,
        resultImageUrl,
      })
      logger.info(`[${requestId}] Recorded image post-process usage`, {
        operation: body.operation,
        workflowId,
        workspaceId,
        userId: authResult.userId,
      })
    } catch (error) {
      logger.error(`[${requestId}] Failed to record image post-process usage, continuing`, {
        error,
        workflowId,
        workspaceId,
        operation: body.operation,
        userId: authResult.userId,
        hasResultImageUrl: Boolean(resultImageUrl),
      })
    }

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

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { executeIdeogramOperation, toIdeogramProxyErrorMessage } from '@/app/api/tools/ideogram/server-utils'
import { ideogramProxyContract } from '@/lib/api/contracts/tools/ideogram'
import { parseRequest } from '@/lib/api/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

const logger = createLogger('IdeogramProxyAPI')

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized Ideogram proxy request: ${authResult.error}`)
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication required' },
        { status: 401 }
      )
    }

    const parsed = await parseRequest(ideogramProxyContract, request, {})
    if (!parsed.success) return parsed.response

    const output = await executeIdeogramOperation(parsed.data.body, authResult.userId, requestId)

    return NextResponse.json({
      success: true,
      output,
    })
  } catch (error) {
    logger.error(`[${requestId}] Ideogram proxy error`, error)
    return NextResponse.json(
      { success: false, error: toIdeogramProxyErrorMessage(error) },
      { status: 500 }
    )
  }
})

import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { arenaGenerativeEditContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { runArenaGenerativeUi } from '@/lib/arena-generative-ui/run-generate'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { mapArenaGenerativeResultToToolResponse } from '@/tools/arena-generative-ui/map-response'

const logger = createLogger('ArenaGenerativeUiEditAPI')

export const dynamic = 'force-dynamic'
/**
 * 25 minutes — matches `ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS`. Next.js requires a
 * static literal for `maxDuration`, so this value must be kept in sync with that source.
 */
export const maxDuration = 1500

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()
  const auth = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success || !auth.userId) {
    logger.warn(`[${requestId}] Unauthorized edit attempt: ${auth.error}`)
    return NextResponse.json(
      { success: false, error: auth.error ?? 'Authentication required' },
      { status: 401 }
    )
  }

  const parsed = await parseRequest(arenaGenerativeEditContract, request, {})
  if (!parsed.success) return parsed.response

  const result = await runArenaGenerativeUi({
    body: parsed.data.body,
    userId: auth.userId,
    requireExistingDraft: true,
  })

  const response = mapArenaGenerativeResultToToolResponse(result)
  if (!response.success) {
    logger.warn(`[${requestId}] Edit failed`, { error: response.error })
    return NextResponse.json(response, { status: 500 })
  }

  logger.info(`[${requestId}] Edit succeeded`, { draftId: response.output.draftId })
  return NextResponse.json(response)
})

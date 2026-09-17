import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { arenaGenerativePlanContract } from '@/lib/api/contracts/arena-generative-apps'
import { runArenaGenerativeUi } from '@/lib/arena-generative-ui/run-generate'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { parseArenaGenerativeUiRequest } from '@/app/api/tools/arena_generative_ui/parse-request'
import { mapArenaGenerativeResultToToolResponse } from '@/tools/arena-generative-ui/map-response'

const logger = createLogger('ArenaGenerativeUiPlanAPI')

export const dynamic = 'force-dynamic'
/**
 * Planner-only. Same ceiling as generate so a slow planner does not 504.
 */
export const maxDuration = 1500

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()
  const auth = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success || !auth.userId) {
    logger.warn(`[${requestId}] Unauthorized plan attempt: ${auth.error}`)
    return NextResponse.json(
      { success: false, error: auth.error ?? 'Authentication required' },
      { status: 401 }
    )
  }

  const parsed = await parseArenaGenerativeUiRequest(arenaGenerativePlanContract, request)
  if (!parsed.success) return parsed.response

  const result = await runArenaGenerativeUi({
    body: { ...parsed.data.body, planOnly: true },
    userId: auth.userId,
    requireExistingDraft: false,
    planOnly: true,
  })

  const response = mapArenaGenerativeResultToToolResponse(result)
  if (!response.success) {
    logger.warn(`[${requestId}] Plan failed`, { error: response.error })
    return NextResponse.json(response, { status: 500 })
  }

  logger.info(`[${requestId}] Plan succeeded`, { draftId: response.output.draftId })
  return NextResponse.json(response)
})

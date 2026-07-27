import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { generativeUiGenerateContract } from '@/lib/api/contracts/tools/generative-ui'
import { parseRequest } from '@/lib/api/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { generateGenerativeUiHtml } from '@/lib/generative-ui/generate-html'
import { mapGenerativeUiResultToToolResponse } from '@/tools/generative_ui/map-response'

const logger = createLogger('GenerativeUiGenerateAPI')

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — Generate email or webpage HTML from a natural-language prompt.
 */
export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  const auth = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success || !auth.userId) {
    logger.warn(`[${requestId}] Unauthorized generative UI generate attempt: ${auth.error}`)
    return NextResponse.json(
      { success: false, error: auth.error ?? 'Authentication required' },
      { status: 401 }
    )
  }

  const parsed = await parseRequest(generativeUiGenerateContract, request, {})
  if (!parsed.success) return parsed.response

  const { userInput, mode } = parsed.data.body

  logger.info(`[${requestId}] Generating generative UI HTML`, { mode })

  const result = await generateGenerativeUiHtml({ userInput, mode })
  const response = mapGenerativeUiResultToToolResponse(result)

  if (!response.success) {
    logger.warn(`[${requestId}] Generative UI generation failed`, { error: response.error, mode })
  } else {
    logger.info(`[${requestId}] Generative UI generation succeeded`, { mode })
  }

  return NextResponse.json(response)
})

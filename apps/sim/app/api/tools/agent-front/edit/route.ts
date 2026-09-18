import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { editAgentFrontApp } from '@/lib/agent-front/generate-app'
import { agentFrontEditContract } from '@/lib/api/contracts/tools/agent-front'
import { getValidationErrorMessage, parseRequest } from '@/lib/api/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { buildToolLlmCostFromModelUsage } from '@/lib/billing/core/tool-llm-cost'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

const logger = createLogger('AgentFrontEditAPI')

export const runtime = 'nodejs'
export const maxDuration = 600

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()
  const auth = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success || !auth.userId) {
    return NextResponse.json(
      { success: false, error: auth.error ?? 'Authentication required' },
      { status: 401 }
    )
  }

  const parsed = await parseRequest(
    agentFrontEditContract,
    request,
    {},
    {
      validationErrorResponse: (error) =>
        NextResponse.json(
          { success: false, error: getValidationErrorMessage(error, 'Invalid request') },
          { status: 400 }
        ),
    }
  )
  if (!parsed.success) {
    return parsed.response
  }

  logger.info('Editing Agent Front app', {
    requestId,
    repoName: parsed.data.body.repoName,
    uiMode: parsed.data.body.uiMode,
    combineMode: parsed.data.body.combineMode,
  })

  const result = await editAgentFrontApp(parsed.data.body)
  const billing = buildToolLlmCostFromModelUsage(result.llmUsage)

  if (!result.success) {
    return NextResponse.json({ ...result, ...(billing ?? {}) }, { status: 400 })
  }

  return NextResponse.json({ ...result, ...(billing ?? {}) })
})

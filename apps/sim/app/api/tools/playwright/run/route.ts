import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { playwrightRunContract } from '@/lib/api/contracts/tools/playwright'
import { parseRequest } from '@/lib/api/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { runPlaywrightSteps } from '@/lib/playwright/executor'
import { generateRequestId } from '@/lib/core/utils/request'

const logger = createLogger('PlaywrightRunAPI')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  const auth = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = await parseRequest(playwrightRunContract, request, {})
    if (!parsed.success) return parsed.response
    const { body } = parsed.data

    logger.info(`[${requestId}] Running Playwright automation`, { stepCount: body.steps.length })

    const result = await runPlaywrightSteps({
      steps: body.steps,
      headless: body.headless,
      timeoutMs: body.timeoutMs,
    })

    const failedStep = result.stepResults.find((step) => !step.success)
    if (failedStep) {
      return NextResponse.json({
        success: false,
        error: failedStep.error ?? `Step "${failedStep.type}" failed`,
        output: result,
      })
    }

    return NextResponse.json({
      success: true,
      output: result,
    })
  } catch (error) {
    logger.error(`[${requestId}] Playwright automation failed`, { error: getErrorMessage(error) })
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Playwright automation failed'),
      },
      { status: 500 }
    )
  }
})

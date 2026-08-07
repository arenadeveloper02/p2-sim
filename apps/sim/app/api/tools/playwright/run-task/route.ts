import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { playwrightRunTaskContract } from '@/lib/api/contracts/tools/playwright'
import { getValidationErrorMessage, parseRequest } from '@/lib/api/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { executePlaywrightTask } from '@/app/api/tools/playwright/execute-task'
import type { PlaywrightRunTaskParams } from '@/tools/playwright/types'

const logger = createLogger('PlaywrightRunTaskAPI')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Matches the 1-hour Playwright agent wall-clock timeout. */
export const maxDuration = 3600

export const POST = withRouteHandler(async (request: NextRequest) => {
  const auth = await checkInternalAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(
    playwrightRunTaskContract,
    request,
    {},
    {
      validationErrorResponse: (error) => {
        logger.error('Invalid request body', { errors: error.issues })
        return NextResponse.json(
          {
            error: getValidationErrorMessage(error, 'Invalid request parameters'),
            details: error.issues,
          },
          { status: 400 }
        )
      },
    }
  )
  if (!parsed.success) return parsed.response

  const body = parsed.data.body
  const params: PlaywrightRunTaskParams = {
    task: body.task,
    startUrl: body.startUrl,
    model: body.model,
    apiKey: body.apiKey,
    variables: body.variables as PlaywrightRunTaskParams['variables'],
    allowedDomains: body.allowedDomains,
    maxSteps: body.maxSteps,
    structuredOutput: body.structuredOutput,
  }

  logger.info('Received Playwright agent request', {
    hasStartUrl: !!params.startUrl,
    model: params.model,
    maxSteps: params.maxSteps,
  })

  const result = await executePlaywrightTask(params)

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        ...result.output,
        error: result.error,
      },
      { status: 200 }
    )
  }

  return NextResponse.json({
    success: true,
    ...result.output,
  })
})

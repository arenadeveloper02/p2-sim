import { getErrorMessage } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import type { ArenaAgentStoreError } from '@/lib/chat/arena-agent-history'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

/**
 * Arena's server calls these routes with the shared cron secret. The Arena user
 * id in the body is trusted only after that check.
 */
export function requireArenaAgentCron(request: NextRequest) {
  return verifyCronAuth(request, 'Arena agent history')
}

export function arenaAgentStoreErrorResponse(result: ArenaAgentStoreError) {
  return createErrorResponse(result.error, result.status)
}

export function arenaAgentFailureResponse(error: unknown, fallback: string) {
  return createErrorResponse(getErrorMessage(error, fallback), 500)
}

export function arenaAgentSuccess(body: unknown) {
  return createSuccessResponse(body)
}

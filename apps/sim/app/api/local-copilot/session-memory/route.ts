import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getLocalCopilotSessionMemoryContract } from '@/local-copilot/contracts/local-copilot'
import { requireLocalCopilotAccess } from '@/local-copilot/lib/access'
import { loadSessionMemory } from '@/local-copilot/lib/context/session-memory'

const logger = createLogger('LocalCopilotSessionMemoryAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessDenied = await requireLocalCopilotAccess(session.user.id)
  if (accessDenied) return accessDenied

  const parsed = await parseRequest(getLocalCopilotSessionMemoryContract, request, {})
  if (!parsed.success) return parsed.response

  const { chatId } = parsed.data.query
  const memory = await loadSessionMemory(chatId, session.user.id)

  logger.info('Loaded Arena Copilot session memory for inspector', {
    chatId,
    present: Boolean(memory),
  })

  return NextResponse.json({ memory })
})

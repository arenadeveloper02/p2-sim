import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '@/app/api/tools/arena/utils/db-utils'

const logger = createLogger('ArenaConversationSummaryAPI')

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflowId')
  const taskId = searchParams.get('taskId')
  const headerToken =
    req.headers.get('authorisation')?.trim() ?? req.headers.get('authorization')?.trim()

  if (!workflowId && !headerToken) {
    return NextResponse.json(
      { error: 'Missing required field: workflowId or authorisation header' },
      { status: 400 }
    )
  }

  if (!taskId) {
    return NextResponse.json({ error: 'Missing required field: taskId' }, { status: 400 })
  }

  let arenaToken = headerToken ?? ''
  if (!arenaToken) {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId as string)
    if (tokenObject.found === false) {
      return NextResponse.json(
        { error: 'Failed to get conversation summary', details: tokenObject.reason },
        { status: 400 }
      )
    }
    arenaToken = tokenObject.arenaToken
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const url = new URL(`${arenaBackendBaseUrl}/sol/v1/agentic/conversation-summary`)
    url.searchParams.set('taskId', taskId)
    logger.info(`Arena conversation summary request URL: ${url.toString()}`)

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorisation: arenaToken || '',
      },
    })

    const responseData = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to get conversation summary', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get conversation summary', details: error },
      { status: 500 }
    )
  }
}

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'

const logger = createLogger('ArenaGetMeetingsAPI')

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflowId')
  const clientId = searchParams.get('clientId')
  const period = searchParams.get('period')

  if (!workflowId) {
    return NextResponse.json({ error: 'Missing required field: workflowId' }, { status: 400 })
  }

  if (!clientId) {
    return NextResponse.json({ error: 'Missing required field: clientId' }, { status: 400 })
  }

  if (!period) {
    return NextResponse.json({ error: 'Missing required field: period' }, { status: 400 })
  }

  const tokenObject = await getArenaTokenByWorkflowId(workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to get meetings', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken } = tokenObject

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const url = new URL(`${arenaBackendBaseUrl}/sol/v1/meeting/all`)
    url.searchParams.set('clientId', clientId)
    url.searchParams.set('period', period)
    logger.info(`Arena meetings request URL: ${url.toString()}`)

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
        { error: 'Failed to get meetings', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get meetings', details: error }, { status: 500 })
  }
}

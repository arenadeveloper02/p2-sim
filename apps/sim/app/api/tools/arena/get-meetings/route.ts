import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

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

  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to get meetings', details: tokenObject.reason },
      { status: 400 }
    )
  }

  try {
    const path = `/sol/v1/meeting/all?clientId=${encodeURIComponent(clientId)}&period=${encodeURIComponent(period)}`
    logger.info('Arena meetings request', { path })

    const res = await arenaFetch(tokenObject.userId, path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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
    if (error instanceof ArenaAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to get meetings', details: error }, { status: 500 })
  }
}

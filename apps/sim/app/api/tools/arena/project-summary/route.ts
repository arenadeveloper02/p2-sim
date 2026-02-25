import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'

const logger = createLogger('ArenaProjectSummaryAPI')

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflowId')
  const cid = searchParams.get('cid')
  const headerToken =
    req.headers.get('authorisation')?.trim() ?? req.headers.get('authorization')?.trim()

  if (!workflowId && !headerToken) {
    return NextResponse.json(
      { error: 'Missing required field: workflowId or authorisation header' },
      { status: 400 }
    )
  }

  if (!cid) {
    return NextResponse.json({ error: 'Missing required field: cid' }, { status: 400 })
  }

  let arenaToken = headerToken ?? ''
  if (!arenaToken) {
    const tokenObject = await getArenaTokenByWorkflowId(workflowId as string)
    if (tokenObject.found === false) {
      return NextResponse.json(
        { error: 'Failed to get project summary', details: tokenObject.reason },
        { status: 400 }
      )
    }
    arenaToken = tokenObject.arenaToken
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const url = new URL(`${arenaBackendBaseUrl}/sol/v1/agentic/project-summary`)
    url.searchParams.set('cid', cid)
    logger.info(`Arena project summary request URL: ${url.toString()}`)

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
        { error: 'Failed to get project summary', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get project summary', details: error },
      { status: 500 }
    )
  }
}

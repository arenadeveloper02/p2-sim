import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'

const logger = createLogger('ArenaClientUpdatedTasksAPI')

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflowId')
  const cid = searchParams.get('cid')
  const period = searchParams.get('period')
  const pageNumber = searchParams.get('pageNumber')
  const pageSize = searchParams.get('pageSize')

  if (!workflowId) {
    return NextResponse.json({ error: 'Missing required field: workflowId' }, { status: 400 })
  }

  if (!cid) {
    return NextResponse.json({ error: 'Missing required field: cid' }, { status: 400 })
  }

  if (!period) {
    return NextResponse.json({ error: 'Missing required field: period' }, { status: 400 })
  }

  const resolvedPageNumber = pageNumber ? Number(pageNumber) : 1
  const resolvedPageSize = pageSize ? Number(pageSize) : 10

  if (!Number.isInteger(resolvedPageNumber) || resolvedPageNumber <= 0) {
    return NextResponse.json({ error: 'Invalid pageNumber' }, { status: 400 })
  }

  if (!Number.isInteger(resolvedPageSize) || resolvedPageSize <= 0) {
    return NextResponse.json({ error: 'Invalid pageSize' }, { status: 400 })
  }

  const tokenObject = await getArenaTokenByWorkflowId(workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to get updated tasks', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken } = tokenObject

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const url = new URL(`http://localhost:8081/v1/tasks/client/updated`)
    url.searchParams.set('cid', cid)
    url.searchParams.set('period', period)
    url.searchParams.set('pageNumber', String(resolvedPageNumber))
    url.searchParams.set('pageSize', String(resolvedPageSize))
    logger.info(`Arena client updated tasks request URL: ${url.toString()}`)

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
        { error: 'Failed to get updated tasks', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get updated tasks', details: error },
      { status: 500 }
    )
  }
}

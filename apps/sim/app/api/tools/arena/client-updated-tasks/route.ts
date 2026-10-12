import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

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

  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to get updated tasks', details: tokenObject.reason },
      { status: 400 }
    )
  }

  try {
    const path = `/sol/v1/tasks/client/updated?cid=${encodeURIComponent(cid)}&period=${encodeURIComponent(period)}&pageNumber=${resolvedPageNumber}&pageSize=${resolvedPageSize}`
    logger.info('Arena client updated tasks request', { path })

    const res = await arenaFetch(tokenObject.userId, path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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
    if (error instanceof ArenaAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to get updated tasks', details: error },
      { status: 500 }
    )
  }
}

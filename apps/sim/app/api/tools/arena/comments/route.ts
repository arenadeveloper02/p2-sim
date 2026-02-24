import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

const logger = createLogger('ArenaCommentsAPI')

export async function POST(req: NextRequest) {
  const data = await req.json()
  const { workflowId, ...restData } = data
  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    logger.error('Add comment failed: Arena token not resolved', {
      reason: tokenObject.reason,
      workflowId,
    })
    return NextResponse.json(
      { error: 'Failed to add comment', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken, email: userEmail } = tokenObject

  const payload = {
    ...restData,
    createdBy: userEmail,
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const res = await fetch(`${arenaBackendBaseUrl}/project/commentattachmentservice/addcomment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: '*/*',
        authorisation: arenaToken || '',
      },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()

    if (!res.ok) {
      logger.error('Add comment failed: Arena API returned error', {
        status: res.status,
        statusText: res.statusText,
        responseData,
        workflowId,
      })
      return NextResponse.json(
        { error: 'Failed to add comment', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    logger.error('Add comment failed: unexpected error', { error, workflowId })
    return NextResponse.json({ error: 'Failed to add comment', details: error }, { status: 500 })
  }
}

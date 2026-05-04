import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflowId')

  if (!workflowId) {
    return NextResponse.json({ error: 'Missing required field: workflowId' }, { status: 400 })
  }

  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to get my tasks', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken } = tokenObject

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const res = await fetch(`${arenaBackendBaseUrl}/sol/v1/tasks/get-my-tasks`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorisation: arenaToken || '',
      },
    })

    const responseData = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to get my tasks', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get my tasks', details: error }, { status: 500 })
  }
}

import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
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
      { error: 'Failed to get my overdue tasks', details: tokenObject.reason },
      { status: 400 }
    )
  }

  try {
    const res = await arenaFetch(tokenObject.userId, '/sol/v1/tasks/get-my-overdue-tasks', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    const responseData = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to get my overdue tasks', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    if (error instanceof ArenaAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to get my overdue tasks', details: error },
      { status: 500 }
    )
  }
}

import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflowId')
  const withinMinutesParam = searchParams.get('withinMinutes')?.trim()

  if (!workflowId) {
    return NextResponse.json({ error: 'Missing required field: workflowId' }, { status: 400 })
  }

  let withinMinutes: number | undefined
  if (withinMinutesParam) {
    const parsed = Number(withinMinutesParam)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: 'Invalid withinMinutes: must be a positive number' },
        { status: 400 }
      )
    }
    withinMinutes = parsed
  }

  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to get my tasks', details: tokenObject.reason },
      { status: 400 }
    )
  }

  try {
    const path =
      withinMinutes !== undefined
        ? `/sol/v1/tasks/get-my-tasks?withinMinutes=${encodeURIComponent(String(withinMinutes))}`
        : '/sol/v1/tasks/get-my-tasks'

    const res = await arenaFetch(tokenObject.userId, path, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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
    if (error instanceof ArenaAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to get my tasks', details: error }, { status: 500 })
  }
}

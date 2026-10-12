import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
import { env } from '@/lib/core/config/env'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const searchParams = new URLSearchParams(url.searchParams)
    const workflowId = searchParams.get('workflowId')
    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 })
    }
    const tokenObject = await getArenaToken(req, workflowId)
    if (tokenObject.found === false) {
      return NextResponse.json(
        { error: 'Failed to create task', details: tokenObject.reason },
        { status: 400 }
      )
    }

    searchParams.delete('workflowId')
    const params = searchParams.toString()
    const arenaPath = params ? `/sol/v1/tasks/users?${params}` : '/sol/v1/tasks/users'

    const response = await arenaFetch(tokenObject.userId, arenaPath, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'accept-language': 'en-GB,en;q=0.9',
      },
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json(
        { error: 'Failed to fetch from Arena', details: err },
        { status: response.status }
      )
    }

    const data = await response.json()
    const formattedData = data.tasks.map((task: { sysId?: string }) => ({
      ...task,
      redirectUrl: `${env.ARENA_FRONTEND_APP_URL}/arn/home?sysId=${task.sysId}`,
    }))

    return NextResponse.json(formattedData)
  } catch (err) {
    if (err instanceof ArenaAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Unexpected error', details: message }, { status: 500 })
  }
}

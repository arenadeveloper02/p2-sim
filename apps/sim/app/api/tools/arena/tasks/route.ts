import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
import { env } from '@/lib/core/config/env'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

export async function POST(req: NextRequest) {
  const data = await req.json()
  const { workflowId, ...restData } = data
  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to create task', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const payload = {
    ...restData,
  }

  try {
    const res = await arenaFetch(tokenObject.userId, '/sol/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()
    responseData.redirectUrl = `${env.ARENA_FRONTEND_APP_URL}/arn/home?sysId=${responseData.sysId}`

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    if (error instanceof ArenaAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create task', details: error }, { status: 500 })
  }
}

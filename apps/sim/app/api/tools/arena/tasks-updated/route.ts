import { type NextRequest, NextResponse } from 'next/server'
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
  const { arenaToken, email: createdBy } = tokenObject

  const payload = {
    ...restData,
    createdBy,
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const res = await fetch(`${arenaBackendBaseUrl}/sol/v1/tasks/updated`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorisation: arenaToken || '',
      },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()
    responseData.redirectUrl = `${env.ARENA_FRONTEND_APP_URL}/arn/home?sysId=${responseData.sysId}`

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create task', details: error }, { status: 500 })
  }
}

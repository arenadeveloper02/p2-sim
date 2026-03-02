import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

export async function POST(req: NextRequest) {
  const data = await req.json()
  const { workflowId, ...restData } = data
  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to save summary', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken } = tokenObject
  const payload = {
    ...restData,
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const res = await fetch(`${arenaBackendBaseUrl}/sol/v1/agentic/save-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorisation: arenaToken || '',
      },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to save summary', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save summary', details: error }, { status: 500 })
  }
}

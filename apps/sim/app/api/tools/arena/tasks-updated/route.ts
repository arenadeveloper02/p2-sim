import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'

export async function POST(req: NextRequest) {
  const data = await req.json()
  const { workflowId, ...restData } = data

  const tokenObject = await getArenaTokenByWorkflowId(workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to create task', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken } = tokenObject

  // Get user email for createdBy if needed
  const session = await getSession()
  const createdBy = session?.user?.email || ''

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

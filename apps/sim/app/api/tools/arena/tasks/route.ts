// app/api/create-task/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

export async function POST(req: NextRequest) {
  const data = await req.json()
  const cookieStore = await cookies()
  const token = cookieStore.get('v2Token')?.value
  const { workflowId, ...restData } = data

  const payload = {
    ...restData,
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const res = await fetch(`${arenaBackendBaseUrl}/sol/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorisation: token || '', // ⬅️ Use env var for security
      },
      body: JSON.stringify(payload),
    })

    const responseData = await res.json()

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create task', details: error }, { status: 500 })
  }
}

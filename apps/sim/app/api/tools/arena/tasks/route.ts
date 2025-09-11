// app/api/create-task/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const data = await req.json()
  const cookieStore = await cookies()
  const token = cookieStore.get('v2Token')?.value

  const payload = {
    ...data,
  }

  try {
    const res = await fetch('https://dev-service.thearena.ai/sol/v1/tasks', {
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

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const searchParams = new URLSearchParams(url.searchParams)
    const cookieStore = await cookies()
    const token = cookieStore.get('v2Token')?.value

    // Extract workflowId separately
    const workflowId = searchParams.get('workflowId')

    // Remove workflowId so it doesn't get sent to Arena
    searchParams.delete('workflowId')

    // Reconstruct Arena API URL with remaining params
    const arenaUrl = `https://service.thearena.ai/sol/v1/tasks/users?${searchParams.toString()}`

    const response = await fetch(arenaUrl, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'accept-language': 'en-GB,en;q=0.9',
        //authorisation: process.env.ARENA_AUTH_TOKEN || '', // 🔑 from .env
        authorisation: token || '', // ⬅️ Use env var for security
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

    // Optionally attach workflowId to response if you need it
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: 'Unexpected error', details: err.message }, { status: 500 })
  }
}

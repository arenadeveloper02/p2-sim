import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { search } = new URL(req.url)

    const arenaUrl = `https://service.thearena.ai/sol/v1/tasks/users${search}`

    const response = await fetch(arenaUrl, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'accept-language': 'en-GB,en;q=0.9',
        authorisation: process.env.ARENA_AUTH_TOKEN || '', // 🔑 keep in .env
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
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: 'Unexpected error', details: err.message }, { status: 500 })
  }
}

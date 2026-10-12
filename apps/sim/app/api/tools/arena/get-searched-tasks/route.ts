import { type NextRequest, NextResponse } from 'next/server'
import { ArenaAuthError, arenaFetch } from '@/lib/arena/fetch'
import { getArenaToken } from '@/app/api/tools/arena/utils/get-token'

interface GetSearchedTasksBody {
  workflowId?: string
  clientName?: string
  projectName?: string
  assigneeName?: string
  state?: string
}

export async function POST(req: NextRequest) {
  const data = (await req.json()) as GetSearchedTasksBody
  const { workflowId, clientName, projectName, assigneeName, state } = data

  if (!workflowId) {
    return NextResponse.json({ error: 'Missing required field: workflowId' }, { status: 400 })
  }

  const tokenObject = await getArenaToken(req, workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to fetch searched tasks', details: tokenObject.reason },
      { status: 400 }
    )
  }

  try {
    const res = await arenaFetch(tokenObject.userId, '/sol/v1/tasks/get-searched-tasks', {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientName: clientName?.trim() ?? '',
        projectName: projectName?.trim() ?? '',
        assigneeName: assigneeName?.trim() ?? '',
        state: state?.trim() ?? '',
      }),
    })

    const responseData = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch searched tasks', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    if (error instanceof ArenaAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to fetch searched tasks', details: error },
      { status: 500 }
    )
  }
}

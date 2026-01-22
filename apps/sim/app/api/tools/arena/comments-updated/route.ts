import { db } from '@sim/db'
import { user } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'

export async function POST(req: NextRequest) {
  const data = await req.json()
  const { workflowId, ...restData } = data
  const tokenObject = await getArenaTokenByWorkflowId(workflowId)
  if (tokenObject.found === false) {
    return NextResponse.json(
      { error: 'Failed to add comment', details: tokenObject.reason },
      { status: 400 }
    )
  }
  const { arenaToken, userId } = tokenObject

  // Get user email
  const [userRecord] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const userEmail = userRecord?.email || ''

  const payload = {
    ...restData,
    createdBy: userEmail,
  }

  try {
    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const res = await fetch(
      `${arenaBackendBaseUrl}/project/commentattachmentservice/addcomment-updated`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
          authorisation: arenaToken || '',
        },
        body: JSON.stringify(payload),
      }
    )

    const responseData = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to add comment', details: responseData },
        { status: res.status }
      )
    }

    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add comment', details: error }, { status: 500 })
  }
}

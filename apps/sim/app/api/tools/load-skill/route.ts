import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveSkillContent } from '@/executor/handlers/agent/skills-resolver'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  skillName: z.string().min(1),
  workspaceId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!authResult.success) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 })
  }

  const body = await request.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.message || 'skillName and workspaceId required' },
      { status: 400 }
    )
  }

  const content = await resolveSkillContent(parsed.data.skillName, parsed.data.workspaceId)
  if (!content) {
    return NextResponse.json(
      { success: false, error: `Skill "${parsed.data.skillName}" not found` },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, output: { content } })
}

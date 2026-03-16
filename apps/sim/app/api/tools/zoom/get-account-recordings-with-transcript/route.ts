import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { executeGetAccountRecordingsWithTranscript } from '@/tools/zoom/get_account_recordings_with_transcript.server'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  accessToken: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  pageSize: z.number().optional(),
  nextPageToken: z.string().optional(),
  meetingTitle: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const authResult = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!authResult.success) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 })
  }

  const body = await request.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })
  }

  const result = await executeGetAccountRecordingsWithTranscript(parsed.data as any)
  return NextResponse.json(result)
}

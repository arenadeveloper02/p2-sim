import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { generateNextjsApp } from '@/lib/development/nextjs-app-generator'

const logger = createLogger('DevelopmentGenerateAPI')

export const runtime = 'nodejs'
export const maxDuration = 600

const RequestSchema = z.object({
  userInput: z.string().min(1, 'userInput is required'),
  repoName: z.string().optional(),
  privateRepo: z.boolean().optional(),
})

export const POST = withRouteHandler(async (request: NextRequest) => {
  const auth = await checkInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }

  logger.info('Generating Next.js app', {
    repoName: parsed.data.repoName,
    privateRepo: parsed.data.privateRepo,
  })

  const result = await generateNextjsApp(parsed.data)

  if (!result.success) {
    return NextResponse.json(result, { status: 500 })
  }

  return NextResponse.json(result)
})

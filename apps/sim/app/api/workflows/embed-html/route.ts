import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'

const logger = createLogger('WorkflowEmbedHtmlApi')

const RequestSchema = z.object({
  persona: z.string().trim().min(1).optional(),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workflowId = process.env.SIM_AGENT_EMBED_WORKFLOW_ID
  const apiKey = process.env.SIM_AGENT_EMBED_KEY
  const agentBaseUrl = process.env.SIM_AGENT_BASE_URL_HTML?.replace(/\/$/, '')
  const defaultPersona = process.env.SIM_AGENT_EMBED_PERSONA?.trim() || 'CEO'

  if (!workflowId || !apiKey || !agentBaseUrl) {
    logger.error('Embed HTML env configuration missing', {
      hasWorkflowId: Boolean(workflowId),
      hasApiKey: Boolean(apiKey),
      hasAgentBaseUrl: Boolean(agentBaseUrl),
    })
    return NextResponse.json({ error: 'Embed HTML API not configured' }, { status: 500 })
  }

  let body: z.infer<typeof RequestSchema> = {}
  try {
    body = RequestSchema.parse(await req.json())
  } catch {
    body = {}
  }

  const persona = body.persona?.trim() || defaultPersona

  try {
    const upstream = await fetch(`${agentBaseUrl}/api/workflows/${workflowId}/execute`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ persona, userId:session.user.id, email:session.user.email }),
      cache: 'no-store',
    })

    if (!upstream.ok) {
      const upstreamError = await upstream.text().catch(() => '')
      logger.error('Upstream embed workflow request failed', {
        workflowId,
        status: upstream.status,
        error: upstreamError,
      })
      return NextResponse.json({ error: 'Failed to fetch workflow HTML' }, { status: upstream.status })
    }

    const payload = (await upstream.json()) as {
      output?:{ result?: { html?: string }}
    }
    const html = payload?.output?.result?.html
    if (typeof html !== 'string' || html.trim().length === 0) {
      return NextResponse.json({ error: 'Workflow response did not include result.html' }, { status: 502 })
    }

    return NextResponse.json({ html })
  } catch (error) {
    logger.error('Failed to render workflow embed HTML', {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

const logger = createLogger('WorkflowEmbedHtmlApi')

const RequestSchema = z.object({
  persona: z.string().trim().min(1).optional(),
})

type AgentExecuteResponse<T> = {
  output?: { result?: T }
  result?: T
}

type EmbedResolveResult = {
  workflow_id?: string | null
  api_key?: string | null
  workflowId?: string | null
  apiKey?: string | null
}

type EmbedHtmlResult = {
  html?: string
}

function parseEmbedCredentials(result: EmbedResolveResult | undefined): {
  workflowId: string | null
  apiKey: string | null
} {
  if (!result) {
    return { workflowId: null, apiKey: null }
  }

  const workflowId =
    (typeof result.workflow_id === 'string' ? result.workflow_id : null) ??
    (typeof result.workflowId === 'string' ? result.workflowId : null)
  const apiKey =
    (typeof result.api_key === 'string' ? result.api_key : null) ??
    (typeof result.apiKey === 'string' ? result.apiKey : null)

  return { workflowId, apiKey }
}

function buildExecuteUrl(agentBaseUrl: string, workflowId: string): string {
  return `${agentBaseUrl}/api/workflows/${workflowId}/execute`
}

function responseForLog<T>(data: AgentExecuteResponse<T>): AgentExecuteResponse<T> {
  const result = data.output?.result ?? data.result
  if (
    result &&
    typeof result === 'object' &&
    'html' in result &&
    typeof (result as EmbedHtmlResult).html === 'string'
  ) {
    const html = (result as EmbedHtmlResult).html as string
    const truncatedResult = { ...result, html: `[truncated ${html.length} chars]` }
    if (data.output?.result) {
      return { ...data, output: { result: truncatedResult as T } }
    }
    return { ...data, result: truncatedResult as T }
  }
  return data
}

async function executeAgentWorkflow<T>(params: {
  agentBaseUrl: string
  workflowId: string
  apiKey: string
  body: Record<string, unknown>
  logLabel: string
}): Promise<
  { ok: true; data: AgentExecuteResponse<T> } | { ok: false; status: number; error: string }
> {
  const url = buildExecuteUrl(params.agentBaseUrl, params.workflowId)

  logger.info(`Embed HTML upstream request: ${params.logLabel}`, {
    url,
    apiKey: params.apiKey,
    workflowId: params.workflowId,
    body: params.body,
  })

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': params.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.body),
    cache: 'no-store',
  })

  if (!upstream.ok) {
    const error = await upstream.text().catch(() => '')
    logger.error(`Embed HTML upstream request failed: ${params.logLabel}`, {
      url,
      apiKey: params.apiKey,
      workflowId: params.workflowId,
      status: upstream.status,
      response: error,
    })
    return { ok: false, status: upstream.status, error }
  }

  const data = (await upstream.json()) as AgentExecuteResponse<T>
  logger.info(`Embed HTML upstream response: ${params.logLabel}`, {
    url,
    apiKey: params.apiKey,
    workflowId: params.workflowId,
    response: responseForLog(data),
  })
  return { ok: true, data }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withRouteHandler(async (req: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resolveWorkflowId = process.env.SIM_AGENT_EMBED_WORKFLOW_ID
  const resolveApiKey = process.env.SIM_AGENT_EMBED_KEY
  const agentBaseUrl = process.env.SIM_AGENT_BASE_URL_HTML?.replace(/\/$/, '')

  if (!resolveWorkflowId || !resolveApiKey || !agentBaseUrl) {
    logger.error('Embed HTML resolver env configuration missing', {
      hasResolveWorkflowId: Boolean(resolveWorkflowId),
      hasResolveApiKey: Boolean(resolveApiKey),
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

  const persona = body.persona?.trim() || 'CEO'

  try {
    const resolveResult = await executeAgentWorkflow<EmbedResolveResult>({
      agentBaseUrl,
      workflowId: resolveWorkflowId,
      apiKey: resolveApiKey,
      body: { userId: session.user.id, email: session.user.email },
      logLabel: 'resolve-credentials',
    })

    if (!resolveResult.ok) {
      logger.error('Embed credential resolver workflow failed', {
        resolveWorkflowId,
        status: resolveResult.status,
        error: resolveResult.error,
      })
      return NextResponse.json(
        { error: 'Failed to resolve embed workflow credentials' },
        { status: resolveResult.status }
      )
    }

    const resolvePayload = resolveResult.data
    const resolved = parseEmbedCredentials(
      resolvePayload.output?.result ?? resolvePayload.result
    )

    logger.info('Embed HTML resolved credentials', {
      workflowId: resolved.workflowId,
      apiKey: resolved.apiKey,
    })

    if (!resolved.workflowId || !resolved.apiKey) {
      logger.error('Embed credential resolver returned incomplete credentials', {
        resolveWorkflowId,
        hasWorkflowId: Boolean(resolved.workflowId),
        hasApiKey: Boolean(resolved.apiKey),
        response: resolvePayload,
      })
      return NextResponse.json(
        { error: 'Agent API did not return workflow_id and api_key' },
        { status: 502 }
      )
    }

    const htmlResult = await executeAgentWorkflow<EmbedHtmlResult>({
      agentBaseUrl,
      workflowId: resolved.workflowId,
      apiKey: resolved.apiKey,
      body: {
        persona,
        userId: session.user.id,
        email: session.user.email,
      },
      logLabel: 'render-html',
    })

    if (!htmlResult.ok) {
      logger.error('Upstream embed workflow request failed', {
        workflowId: resolved.workflowId,
        status: htmlResult.status,
        error: htmlResult.error,
      })
      return NextResponse.json(
        { error: 'Failed to fetch workflow HTML' },
        { status: htmlResult.status }
      )
    }

    const htmlPayload = htmlResult.data
    const html =
      htmlPayload.output?.result?.html ?? htmlPayload.result?.html
    if (typeof html !== 'string' || html.trim().length === 0) {
      return NextResponse.json(
        { error: 'Workflow response did not include result.html' },
        { status: 502 }
      )
    }

    return NextResponse.json({ html })
  } catch (error) {
    logger.error('Failed to render workflow embed HTML', {
      error: toError(error).message,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

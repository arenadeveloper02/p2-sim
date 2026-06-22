import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { skyvernWorkflowsContract } from '@/lib/api/contracts/tools/skyvern'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  buildSkyvernUrl,
  requireSkyvernApiKey,
  resolveSkyvernAgentsApiPath,
  resolveSkyvernBaseUrl,
} from '@/tools/skyvern/utils'

const logger = createLogger('SkyvernWorkflowsAPI')

export const dynamic = 'force-dynamic'

const SKYVERN_MAX_WORKFLOW_PAGES = 50
const SKYVERN_WORKFLOW_PAGE_SIZE = 100

interface SkyvernWorkflowRecord {
  workflow_id?: string
  workflow_permanent_id?: string
  agent_id?: string
  title?: string
  description?: string | null
  status?: string | null
}

function toWorkflowOption(workflow: SkyvernWorkflowRecord): { id: string; name: string } | null {
  const id = String(
    workflow.workflow_permanent_id ?? workflow.agent_id ?? workflow.workflow_id ?? ''
  ).trim()
  if (!id) return null

  const title = String(workflow.title ?? '').trim()
  const name = title || id
  return { id, name }
}

function resolveSelectorCredentials(params: { apiKey?: string; baseUrl?: string }): {
  apiKey: string
  baseUrl: string
} {
  const serverApiKey = env.SKYVERN_API_KEY?.trim()
  const bodyApiKey = params.apiKey?.trim()

  // When the deployment provides credentials, ignore stale block baseUrl/apiKey
  // unless the caller explicitly passes an API key (BYOK).
  if (serverApiKey && !bodyApiKey) {
    return {
      apiKey: serverApiKey,
      baseUrl: resolveSkyvernBaseUrl(),
    }
  }

  return {
    apiKey: requireSkyvernApiKey(bodyApiKey),
    baseUrl: resolveSkyvernBaseUrl(params.baseUrl),
  }
}

async function fetchSkyvernWorkflows(params: {
  apiKey?: string
  baseUrl?: string
  searchKey?: string
}): Promise<Array<{ id: string; name: string }>> {
  const { apiKey, baseUrl } = resolveSelectorCredentials(params)
  const agentsPath = resolveSkyvernAgentsApiPath()

  const workflowsById = new Map<string, { id: string; name: string }>()

  for (let page = 1; page <= SKYVERN_MAX_WORKFLOW_PAGES; page++) {
    const url = new URL(buildSkyvernUrl(baseUrl, agentsPath))
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(SKYVERN_WORKFLOW_PAGE_SIZE))
    if (params.searchKey?.trim()) {
      url.searchParams.set('search_key', params.searchKey.trim())
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('Failed to fetch Skyvern workflows', {
        status: response.status,
        baseUrl,
        error: errorData,
      })
      const detail =
        typeof errorData === 'object' &&
        errorData !== null &&
        'detail' in errorData &&
        typeof errorData.detail === 'string'
          ? errorData.detail
          : `Failed to fetch Skyvern workflows (${response.status})`
      const error = new Error(detail) as Error & { status?: number }
      error.status = response.status
      throw error
    }

    const data = await response.json()
    const workflows = Array.isArray(data) ? data : (data.workflows ?? [])

    for (const workflow of workflows as SkyvernWorkflowRecord[]) {
      const option = toWorkflowOption(workflow)
      if (option) {
        workflowsById.set(option.id, option)
      }
    }

    if (workflows.length < SKYVERN_WORKFLOW_PAGE_SIZE) {
      break
    }

    if (page === SKYVERN_MAX_WORKFLOW_PAGES) {
      logger.warn('Skyvern workflows listing hit pagination cap; list may be incomplete', {
        pages: SKYVERN_MAX_WORKFLOW_PAGES,
      })
    }
  }

  return Array.from(workflowsById.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export const POST = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(skyvernWorkflowsContract, request, {})
  if (!parsed.success) return parsed.response

  const { apiKey, baseUrl, searchKey, workflowId } = parsed.data.body

  try {
    const workflows = await fetchSkyvernWorkflows({ apiKey, baseUrl, searchKey })

    if (workflowId?.trim()) {
      const match = workflows.find((workflow) => workflow.id === workflowId.trim())
      return NextResponse.json({ workflows: match ? [match] : [] })
    }

    return NextResponse.json({ workflows })
  } catch (error) {
    logger.error('Error fetching Skyvern workflows', { error: getErrorMessage(error) })
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status)
        : 500
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to retrieve Skyvern workflows') },
      { status: status === 403 || status === 401 ? status : 500 }
    )
  }
})

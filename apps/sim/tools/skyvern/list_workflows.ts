import type { SkyvernListWorkflowsParams, SkyvernListWorkflowsResponse } from '@/tools/skyvern/types'
import {
  buildSkyvernUrl,
  requireSkyvernApiKey,
  resolveSkyvernAgentsApiPath,
  resolveSkyvernBaseUrl,
} from '@/tools/skyvern/utils'
import type { ToolConfig } from '@/tools/types'

export const skyvernListWorkflowsTool: ToolConfig<
  SkyvernListWorkflowsParams,
  SkyvernListWorkflowsResponse
> = {
  id: 'skyvern_list_workflows',
  name: 'Skyvern List Workflows',
  description: 'List Skyvern workflows for the organization',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description:
        'Skyvern API key (x-api-key header). Optional if SKYVERN_API_KEY is set on the server.',
    },
    baseUrl: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description:
        'Skyvern server base URL (e.g. https://api.skyvern.com). Optional if SKYVERN_BASE_URL is set on the server.',
    },
    page: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Page number for pagination',
    },
    pageSize: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of workflows per page',
    },
    status: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Filter by workflow status',
    },
    searchKey: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Search workflows by title, folder, or parameter metadata',
    },
  },

  request: {
    allowHttp: true,
    url: (params) => {
      const url = new URL(
        buildSkyvernUrl(resolveSkyvernBaseUrl(params.baseUrl), resolveSkyvernAgentsApiPath())
      )

      if (params.page != null) {
        url.searchParams.set('page', String(params.page))
      }
      if (params.pageSize != null) {
        url.searchParams.set('page_size', String(params.pageSize))
      }
      if (params.status?.trim()) {
        url.searchParams.set('status', params.status.trim())
      }
      if (params.searchKey?.trim()) {
        url.searchParams.set('search_key', params.searchKey.trim())
      }

      return url.toString()
    },
    method: 'GET',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'x-api-key': requireSkyvernApiKey(params.apiKey),
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    const workflows = Array.isArray(data) ? data : (data.workflows ?? [])

    return {
      success: true,
      output: {
        workflows: workflows.map((workflow: Record<string, unknown>) => ({
          workflowId: String(workflow.workflow_id ?? ''),
          workflowPermanentId: String(workflow.workflow_permanent_id ?? ''),
          title: String(workflow.title ?? ''),
          description: (workflow.description as string | null | undefined) ?? null,
          status: (workflow.status as string | null | undefined) ?? null,
          version: (workflow.version as number | null | undefined) ?? null,
          agentId: String(workflow.agent_id ?? workflow.workflow_permanent_id ?? ''),
          createdAt: (workflow.created_at as string | null | undefined) ?? null,
          modifiedAt: (workflow.modified_at as string | null | undefined) ?? null,
        })),
        count: workflows.length,
      },
    }
  },

  outputs: {
    workflows: {
      type: 'array',
      description: 'List of workflows',
      items: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow version ID (w_...)' },
          workflowPermanentId: {
            type: 'string',
            description: 'Permanent workflow ID (wpid_...)',
          },
          title: { type: 'string', description: 'Workflow title' },
          description: { type: 'string', description: 'Workflow description' },
          status: { type: 'string', description: 'Workflow status' },
          version: { type: 'number', description: 'Workflow version number' },
          agentId: { type: 'string', description: 'Agent ID (wpid_...)' },
          createdAt: { type: 'string', description: 'Creation timestamp' },
          modifiedAt: { type: 'string', description: 'Last modified timestamp' },
        },
      },
    },
    count: {
      type: 'number',
      description: 'Number of workflows returned',
    },
  },
}

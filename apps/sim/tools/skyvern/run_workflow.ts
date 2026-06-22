import type { SkyvernRunWorkflowParams, SkyvernRunWorkflowResponse } from '@/tools/skyvern/types'
import {
  buildSkyvernUrl,
  requireSkyvernApiKey,
  resolveSkyvernBaseUrl,
  resolveSkyvernRunAgentsApiPath,
} from '@/tools/skyvern/utils'
import type { ToolConfig } from '@/tools/types'

export const skyvernRunWorkflowTool: ToolConfig<SkyvernRunWorkflowParams, SkyvernRunWorkflowResponse> =
  {
    id: 'skyvern_run_workflow',
    name: 'Skyvern Run Workflow',
    description: 'Run a Skyvern workflow by permanent workflow ID (agent_id)',
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
      workflowPermanentId: {
        type: 'string',
        required: true,
        visibility: 'user-or-llm',
        description: 'Permanent workflow / agent ID (wpid_...)',
      },
      parameters: {
        type: 'json',
        required: false,
        visibility: 'user-or-llm',
        description: 'Workflow run parameters (e.g. { "starting_url": "https://example.com" })',
      },
      title: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional title for this workflow run',
      },
    },

    request: {
      allowHttp: true,
      url: (params) =>
        buildSkyvernUrl(resolveSkyvernBaseUrl(params.baseUrl), resolveSkyvernRunAgentsApiPath()),
      method: 'POST',
      headers: (params) => ({
        'Content-Type': 'application/json',
        'x-api-key': requireSkyvernApiKey(params.apiKey),
      }),
      body: (params) => ({
        agent_id: params.workflowPermanentId.trim(),
        parameters: params.parameters ?? {},
        ...(params.title?.trim() ? { title: params.title.trim() } : {}),
      }),
    },

    transformResponse: async (response) => {
      const data = await response.json()
      const runId = data.run_id ?? data.workflow_run_id ?? null
      const runRequest = data.run_request as Record<string, unknown> | null | undefined
      const workflowId =
        typeof runRequest?.workflow_id === 'string' ? runRequest.workflow_id : null

      return {
        success: true,
        output: {
          workflowId,
          workflowRunId: runId,
          status: data.status ?? null,
          agentId: workflowId,
          agentRunId: runId,
        },
      }
    },

    outputs: {
      workflowId: {
        type: 'string',
        description: 'Workflow permanent ID that was run',
        optional: true,
      },
      workflowRunId: {
        type: 'string',
        description: 'Workflow run ID (wr_...) for polling status',
      },
      status: {
        type: 'string',
        description: 'Initial run status (e.g. created, queued, running)',
        optional: true,
      },
      agentId: {
        type: 'string',
        description: 'Agent ID associated with the run',
        optional: true,
      },
      agentRunId: {
        type: 'string',
        description: 'Run ID (wr_...) — same as workflowRunId',
        optional: true,
      },
    },
  }

import { buildSkyvernCreateWorkflowBody } from '@/tools/skyvern/build-create-workflow-body'
import type { SkyvernCreateWorkflowParams, SkyvernCreateWorkflowResponse } from '@/tools/skyvern/types'
import {
  buildSkyvernUrl,
  requireSkyvernApiKey,
  resolveSkyvernAgentsApiPath,
  resolveSkyvernBaseUrl,
} from '@/tools/skyvern/utils'
import type { ToolConfig } from '@/tools/types'

export const skyvernCreateWorkflowTool: ToolConfig<
  SkyvernCreateWorkflowParams,
  SkyvernCreateWorkflowResponse
> = {
  id: 'skyvern_create_workflow',
  name: 'Skyvern Create Workflow',
  description: 'Create a new Skyvern browser automation workflow',
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
    title: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Workflow title',
    },
    description: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Workflow description',
    },
    blockLabel: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Label for the task block (default UI_Automation)',
    },
    url: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Starting URL for the browser task block',
    },
    navigationGoal: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Natural-language navigation goal for the task block',
    },
    dataExtractionGoal: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Natural-language data extraction goal for the task block',
    },
    prompt: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional step-by-step instructions (used as navigation goal when navigation goal is empty)',
    },
    workflowParameters: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Workflow input parameters (key, workflow_parameter_type, description, default_value)',
    },
  },

  request: {
    allowHttp: true,
    url: (params) =>
      buildSkyvernUrl(resolveSkyvernBaseUrl(params.baseUrl), resolveSkyvernAgentsApiPath()),
    method: 'POST',
    headers: (params) => ({
      'Content-Type': 'application/json',
      'x-api-key': requireSkyvernApiKey(params.apiKey),
    }),
    body: (params) => buildSkyvernCreateWorkflowBody(params),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    return {
      success: true,
      output: {
        workflowId: data.workflow_id ?? null,
        workflowPermanentId: data.workflow_permanent_id ?? null,
        title: data.title ?? null,
        description: data.description ?? null,
        status: data.status ?? null,
        version: data.version ?? null,
        agentId: data.agent_id ?? data.workflow_permanent_id ?? null,
      },
    }
  },

  outputs: {
    workflowId: {
      type: 'string',
      description: 'Workflow version ID (w_...)',
      optional: true,
    },
    workflowPermanentId: {
      type: 'string',
      description: 'Permanent workflow ID (wpid_...) used to run the workflow',
    },
    title: {
      type: 'string',
      description: 'Workflow title',
      optional: true,
    },
    description: {
      type: 'string',
      description: 'Workflow description',
      optional: true,
    },
    status: {
      type: 'string',
      description: 'Workflow status (e.g. published)',
      optional: true,
    },
    version: {
      type: 'number',
      description: 'Workflow version number',
      optional: true,
    },
    agentId: {
      type: 'string',
      description: 'Agent ID (wpid_...) associated with the workflow',
      optional: true,
    },
  },
}

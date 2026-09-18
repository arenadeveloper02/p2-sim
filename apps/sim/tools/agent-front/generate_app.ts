import { mapAgentFrontResultToToolResponse } from '@/tools/agent-front/map-response'
import type {
  AgentFrontGenerateAppParams,
  AgentFrontGenerateAppResponse,
} from '@/tools/agent-front/types'
import type { ToolConfig } from '@/tools/types'

export const agentFrontGenerateAppTool: ToolConfig<
  AgentFrontGenerateAppParams,
  AgentFrontGenerateAppResponse
> = {
  id: 'agent_front_generate_app',
  name: 'Generate Agent Front App',
  description:
    'Generate a self-hosted form or chat UI that calls one or more workflow APIs via server-side proxies',
  version: '1.0.0',

  params: {
    userInput: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Describe the form or chat UI and how API results should be shown',
    },
    uiMode: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'form or chat',
    },
    combineMode: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'parallel, sequence, or prompt',
    },
    repoName: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Folder name under generated-apps/ (kebab-case)',
    },
    api1Name: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Display name for API 1',
    },
    api1Curl: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Exact execute curl for API 1',
    },
    api1Key: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'API key for API 1 (server-side only)',
    },
    api2Name: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Display name for API 2',
    },
    api2Curl: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Exact execute curl for API 2',
    },
    api2Key: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'API key for API 2 (server-side only)',
    },
    api3Name: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Display name for API 3',
    },
    api3Curl: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Exact execute curl for API 3',
    },
    api3Key: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'API key for API 3 (server-side only)',
    },
  },

  request: {
    url: '/api/tools/agent-front/generate',
    method: 'POST',
    timeout: 600_000,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      userInput: params.userInput,
      uiMode: params.uiMode,
      combineMode: params.combineMode,
      repoName: params.repoName,
      api1Name: params.api1Name,
      api1Curl: params.api1Curl,
      api1Key: params.api1Key,
      api2Name: params.api2Name,
      api2Curl: params.api2Curl,
      api2Key: params.api2Key,
      api3Name: params.api3Name,
      api3Curl: params.api3Curl,
      api3Key: params.api3Key,
      workspaceId: params._context?.workspaceId,
      workflowId: params._context?.workflowId,
      executionId: params._context?.executionId,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      return mapAgentFrontResultToToolResponse({
        success: false,
        error: data.error ?? response.statusText,
      })
    }
    return mapAgentFrontResultToToolResponse(data)
  },

  outputs: {
    content: { type: 'string', description: 'Summary of the generation result' },
    appName: { type: 'string', description: 'Human-readable application name' },
    repoName: { type: 'string', description: 'Repository folder name that was created' },
    description: { type: 'string', description: 'Short description of the generated app' },
    features: { type: 'json', description: 'List of features included in the generated app' },
    outputPath: {
      type: 'string',
      description: 'Relative path to the generated app (generated-apps/...)',
    },
    absoluteOutputPath: {
      type: 'string',
      description: 'Absolute filesystem path to the generated app folder',
      optional: true,
    },
    fileCount: { type: 'number', description: 'Number of files written' },
    uiMode: { type: 'string', description: 'form or chat', optional: true },
    combineMode: {
      type: 'string',
      description: 'parallel, sequence, or prompt',
      optional: true,
    },
    apiCount: { type: 'number', description: 'Number of wired API endpoints', optional: true },
    apis: {
      type: 'json',
      description: 'Named APIs with wired flags',
      optional: true,
    },
    previewHtml: {
      type: 'string',
      description: 'Static HTML snapshot for UI preview',
      optional: true,
    },
    previewPath: {
      type: 'string',
      description: 'Path to preview.html in the generated app folder',
      optional: true,
    },
  },
}

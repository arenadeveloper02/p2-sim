import { mapAgentUiResultToToolResponse } from '@/tools/agent-ui/map-response'
import type { AgentUiEditAppParams, AgentUiEditAppResponse } from '@/tools/agent-ui/types'
import type { ToolConfig } from '@/tools/types'

export const agentUiEditAppTool: ToolConfig<AgentUiEditAppParams, AgentUiEditAppResponse> = {
  id: 'agent_ui_edit_app',
  name: 'Edit Agent UI App',
  description:
    'Edit an existing self-hosted Agent UI Next.js app, keeping Postgres and optional API wiring',
  version: '1.0.0',

  params: {
    userInput: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Requested UI or behavior changes for the existing app',
    },
    repoName: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Repository name of the existing generated app to edit',
    },
    apiCurl: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Exact workflow execute curl. When set, Submit calls this API server-side',
    },
    apiKey: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Workflow API key (X-API-Key). Written to the generated app .env only',
    },
  },

  request: {
    url: '/api/tools/development/edit',
    method: 'POST',
    timeout: 600_000,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      userInput: params.userInput,
      repoName: params.repoName,
      apiCurl: params.apiCurl,
      apiKey: params.apiKey,
      agentUiMode: true,
      workspaceId: params._context?.workspaceId,
      workflowId: params._context?.workflowId,
      executionId: params._context?.executionId,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      return mapAgentUiResultToToolResponse({
        success: false,
        error: data.error ?? response.statusText,
      })
    }
    return mapAgentUiResultToToolResponse(data)
  },

  outputs: {
    content: { type: 'string', description: 'Summary of the edit result' },
    appName: { type: 'string', description: 'Human-readable application name' },
    repoName: { type: 'string', description: 'Repository folder name that was edited' },
    description: { type: 'string', description: 'Short description of the app' },
    features: {
      type: 'json',
      description: 'List of main features included in the app',
    },
    outputPath: {
      type: 'string',
      description: 'Relative path to the edited app (generated-apps/...)',
    },
    absoluteOutputPath: {
      type: 'string',
      description: 'Absolute filesystem path to the edited app folder',
      optional: true,
    },
    fileCount: { type: 'number', description: 'Number of files in the edited app' },
    buildValidated: {
      type: 'boolean',
      description: 'Whether local validation passed',
      optional: true,
    },
    buildOutput: {
      type: 'string',
      description: 'Build validation log output',
      optional: true,
    },
    apiWired: {
      type: 'boolean',
      description: 'Whether a workflow API curl was provided and wired',
      optional: true,
    },
    hasDatabase: {
      type: 'boolean',
      description: 'Whether Postgres/Prisma is included',
      optional: true,
    },
    previewHtml: {
      type: 'string',
      description: 'Static HTML snapshot for UI preview',
      optional: true,
    },
    previewPath: {
      type: 'string',
      description: 'Path to preview.html in the app folder',
      optional: true,
    },
  },
}

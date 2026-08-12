import { DevelopmentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { AgentUiGenerateAppResponse } from '@/tools/agent-ui/types'

let _inflightRepoFetch: Promise<Array<{ label: string; id: string }>> | null = null

async function fetchAgentUiRepos(): Promise<Array<{ label: string; id: string }>> {
  if (_inflightRepoFetch) {
    return _inflightRepoFetch
  }

  _inflightRepoFetch =
    // boundary-raw-fetch: internal JSON GET for Agent UI block repo dropdown hydration
    fetch('/api/tools/development/repos', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => {
        _inflightRepoFetch = null
        if (!data?.success || !Array.isArray(data.repos)) {
          return []
        }

        return data.repos.map((repo: { id: string; name: string; source?: string }) => ({
          id: repo.id,
          label: repo.name,
        }))
      })
      .catch(() => {
        _inflightRepoFetch = null
        return []
      })

  return _inflightRepoFetch
}

export const AgentUiBlock: BlockConfig<AgentUiGenerateAppResponse> = {
  type: 'agent_ui',
  name: 'Agent UI',
  description: 'Generate a self-hosted Next.js UI for an agent workflow API',
  longDescription:
    'Mini app generator: creates a self-hosted Next.js App Router app with Postgres + Prisma from a prompt. Optional API curl and API key wire Submit to a Sim workflow execute endpoint via a server route. Also writes preview.html for a static UI preview. Does not push to GitHub or deploy to Vercel.',
  bestPractices: `
  - Use Generate mode for a new UI. Describe pages, fields, copy, and result layout in User Input.
  - Paste the exact workflow execute curl in API curl when Submit should call that API. Leave it empty for a UI-only app.
  - Put the real API key in the API key field (not in User Input). It is written to the generated app .env only.
  - After generation, open preview.html (previewPath) to preview the UI, or run bun install, set DATABASE_URL, prisma migrate, bun dev.
  - Use Edit mode to change an existing generated app. Pick the repository, then describe the changes.
  - Requires ANTHROPIC_API_KEY for codegen (uses claude-sonnet-5).
  `,
  category: 'blocks',
  integrationType: IntegrationType.DevOps,
  bgColor: '#0F172A',
  icon: DevelopmentIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Generate New App', id: 'generate' },
        { label: 'Edit Existing App', id: 'edit' },
      ],
      value: () => 'generate',
    },
    {
      id: 'userInput',
      title: 'User Input',
      type: 'long-input',
      placeholder:
        'Describe the UI: name, pages, form fields, layout, copy, and how results should look...',
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are an expert product engineer. Expand the user's app idea into a clear, actionable specification for generating a self-hosted Next.js UI.

Include:
- App name and purpose
- Main features and user flows
- Pages and form fields
- UI style and design direction
- How results should be displayed

Return ONLY the specification text. No markdown wrappers.`,
        placeholder: 'Describe the Agent UI you want to build...',
      },
    },
    {
      id: 'apiCurl',
      title: 'API curl',
      type: 'long-input',
      placeholder:
        'curl -X POST -H "X-API-Key: $SIM_API_KEY" -H "Content-Type: application/json" -d \'{"field":"value"}\' https://your-host/api/workflows/WORKFLOW_ID/execute',
      required: false,
      description:
        'Exact workflow execute curl. When set, Submit calls this API from a server route. Leave empty for a UI-only app.',
    },
    {
      id: 'apiKey',
      title: 'API key',
      type: 'short-input',
      password: true,
      placeholder: 'Workflow API key (optional)',
      required: false,
      description:
        'X-API-Key for the workflow API. Written to the generated app .env — never to client code. Required for live API calls when API curl is set.',
    },
    {
      id: 'existingRepo',
      title: 'Repository',
      type: 'dropdown',
      required: { field: 'operation', value: 'edit' },
      condition: { field: 'operation', value: 'edit' },
      description: 'Select an existing generated app repository to edit.',
      options: [],
      fetchOptions: async () => fetchAgentUiRepos(),
      fetchOptionById: async (_blockId: string, optionId: string) => {
        const repos = await fetchAgentUiRepos()
        const match = repos.find((repo) => repo.id === optionId)
        return match ?? { id: optionId, label: optionId }
      },
    },
  ],
  tools: {
    access: ['agent_ui_generate_app', 'agent_ui_edit_app'],
    config: {
      tool: (params) =>
        params.operation === 'edit' ? 'agent_ui_edit_app' : 'agent_ui_generate_app',
      params: (params) =>
        params.operation === 'edit'
          ? {
              userInput: params.userInput,
              repoName: params.existingRepo,
              apiCurl: params.apiCurl,
              apiKey: params.apiKey,
            }
          : {
              userInput: params.userInput,
              apiCurl: params.apiCurl,
              apiKey: params.apiKey,
            },
    },
  },
  inputs: {
    operation: {
      type: 'string',
      description: 'Whether to generate a new app or edit an existing repository',
    },
    userInput: {
      type: 'string',
      description: 'UI/app description or edit instructions',
    },
    apiCurl: {
      type: 'string',
      description: 'Exact workflow execute curl (optional)',
    },
    apiKey: {
      type: 'string',
      description: 'Workflow API key (optional)',
    },
    existingRepo: {
      type: 'string',
      description: 'Repository name of an existing generated app (edit mode)',
    },
  },
  outputs: {
    content: { type: 'string', description: 'Summary of the generation or edit result' },
    appName: { type: 'string', description: 'Human-readable application name' },
    repoName: { type: 'string', description: 'Repository folder name that was created or edited' },
    description: { type: 'string', description: 'Short description of the generated app' },
    features: {
      type: 'json',
      description: 'List of main features (strings) included in the generated app',
    },
    outputPath: {
      type: 'string',
      description: 'Relative path to the generated app (generated-apps/<repo>)',
    },
    absoluteOutputPath: {
      type: 'string',
      description: 'Absolute path on disk where the app folder was written',
    },
    fileCount: { type: 'number', description: 'Number of files written' },
    buildValidated: {
      type: 'boolean',
      description: 'Whether local validation passed',
    },
    buildOutput: {
      type: 'string',
      description: 'Build validation log output',
    },
    apiWired: {
      type: 'boolean',
      description: 'Whether a workflow API curl was provided and wired',
    },
    hasDatabase: {
      type: 'boolean',
      description: 'Whether Postgres/Prisma is included',
    },
    previewHtml: {
      type: 'string',
      description: 'Static HTML snapshot for UI preview',
    },
    previewPath: {
      type: 'string',
      description: 'Path to preview.html in the generated app folder',
    },
  },
}

import { DevelopmentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { AgentFrontGenerateAppResponse } from '@/tools/agent-front/types'

let _inflightRepoFetch: Promise<Array<{ label: string; id: string }>> | null = null

async function fetchAgentFrontRepos(): Promise<Array<{ label: string; id: string }>> {
  if (_inflightRepoFetch) {
    return _inflightRepoFetch
  }

  _inflightRepoFetch =
    // boundary-raw-fetch: internal JSON GET for Agent Front block repo dropdown hydration
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

export const AgentFrontBlock: BlockConfig<AgentFrontGenerateAppResponse> = {
  type: 'agent_front',
  name: 'Agent Front',
  description: 'Generate a form or chat UI that calls one or more workflow APIs',
  longDescription:
    'Creates a self-hosted Next.js form or chat front door. Capture up to three API curls and keys; Submit/Send calls a server proxy that combines responses (parallel or sequence). Keys stay in .env — never in the browser. Does not use Development/Arena deploy paths.',
  bestPractices: `
  - Paste each workflow execute curl into API 1–3. Name them clearly (e.g. enrichment, intent).
  - Provide API keys for each curl so the generated .env is ready.
  - Use Combine = Parallel to call all APIs at once, Sequence to pipe A → B → C.
  - Describe the UI and how to display combined results in User Input.
  - After generation, open absoluteOutputPath, run bun install && bun dev, or open preview.html for a static peek.
  `,
  category: 'blocks',
  integrationType: IntegrationType.AI,
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
        'Describe the form or chat UI, fields, and how to show results from the wired APIs...',
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are an expert product engineer. Expand the user's idea into a clear Agent Front UI specification.

Include:
- App name and purpose
- Form fields or chat starter prompts
- How each named API is used
- How combined API results should be displayed

Return ONLY the specification text. No markdown wrappers.`,
        placeholder: 'Describe the Agent Front UI you want to build...',
      },
    },
    {
      id: 'uiMode',
      title: 'UI Type',
      type: 'dropdown',
      options: [
        { label: 'Form', id: 'form' },
        { label: 'Chat', id: 'chat' },
      ],
      value: () => 'form',
    },
    {
      id: 'combineMode',
      title: 'Combine APIs',
      type: 'dropdown',
      options: [
        { label: 'Parallel', id: 'parallel' },
        { label: 'Sequence', id: 'sequence' },
        { label: 'Prompt (parallel + layout from prompt)', id: 'prompt' },
      ],
      value: () => 'parallel',
    },
    {
      id: 'repoName',
      title: 'Repository Name',
      type: 'short-input',
      placeholder: 'my-agent-front (kebab-case)',
      condition: { field: 'operation', value: 'generate' },
      required: false,
    },
    {
      id: 'existingRepo',
      title: 'Repository',
      type: 'dropdown',
      required: { field: 'operation', value: 'edit' },
      condition: { field: 'operation', value: 'edit' },
      description: 'Select an existing generated app repository to edit.',
      options: [],
      fetchOptions: async () => fetchAgentFrontRepos(),
      fetchOptionById: async (_blockId: string, optionId: string) => {
        const repos = await fetchAgentFrontRepos()
        const match = repos.find((repo) => repo.id === optionId)
        return match ?? { id: optionId, label: optionId }
      },
    },
    {
      id: 'api1Name',
      title: 'API 1 Name',
      type: 'short-input',
      placeholder: 'enrichment',
      required: false,
    },
    {
      id: 'api1Curl',
      title: 'API 1 Curl',
      type: 'long-input',
      placeholder: 'curl -X POST https://.../api/workflows/.../execute -H "X-API-Key: ..."',
      required: false,
      rows: 3,
    },
    {
      id: 'api1Key',
      title: 'API 1 Key',
      type: 'short-input',
      password: true,
      placeholder: 'API key (stored in generated .env only)',
      required: false,
    },
    {
      id: 'api2Name',
      title: 'API 2 Name',
      type: 'short-input',
      placeholder: 'optional',
      required: false,
    },
    {
      id: 'api2Curl',
      title: 'API 2 Curl',
      type: 'long-input',
      placeholder: 'Optional second workflow execute curl',
      required: false,
      rows: 3,
    },
    {
      id: 'api2Key',
      title: 'API 2 Key',
      type: 'short-input',
      password: true,
      placeholder: 'Optional',
      required: false,
    },
    {
      id: 'api3Name',
      title: 'API 3 Name',
      type: 'short-input',
      placeholder: 'optional',
      required: false,
    },
    {
      id: 'api3Curl',
      title: 'API 3 Curl',
      type: 'long-input',
      placeholder: 'Optional third workflow execute curl',
      required: false,
      rows: 3,
    },
    {
      id: 'api3Key',
      title: 'API 3 Key',
      type: 'short-input',
      password: true,
      placeholder: 'Optional',
      required: false,
    },
  ],
  tools: {
    access: ['agent_front_generate_app', 'agent_front_edit_app'],
    config: {
      tool: (params) =>
        params.operation === 'edit' ? 'agent_front_edit_app' : 'agent_front_generate_app',
      params: (params) => {
        const base = {
          userInput: params.userInput,
          uiMode: params.uiMode === 'chat' ? 'chat' : 'form',
          combineMode:
            params.combineMode === 'sequence' || params.combineMode === 'prompt'
              ? params.combineMode
              : 'parallel',
          api1Name: params.api1Name,
          api1Curl: params.api1Curl,
          api1Key: params.api1Key,
          api2Name: params.api2Name,
          api2Curl: params.api2Curl,
          api2Key: params.api2Key,
          api3Name: params.api3Name,
          api3Curl: params.api3Curl,
          api3Key: params.api3Key,
        }
        if (params.operation === 'edit') {
          return {
            ...base,
            repoName: params.existingRepo,
          }
        }
        return {
          ...base,
          ...(params.repoName ? { repoName: params.repoName } : {}),
        }
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'generate or edit' },
    userInput: { type: 'string', description: 'UI description' },
    uiMode: { type: 'string', description: 'form or chat' },
    combineMode: { type: 'string', description: 'parallel, sequence, or prompt' },
    repoName: { type: 'string', description: 'Optional repo folder name' },
    existingRepo: { type: 'string', description: 'Existing repo for edit mode' },
    api1Name: { type: 'string', description: 'API 1 name' },
    api1Curl: { type: 'string', description: 'API 1 curl' },
    api1Key: { type: 'string', description: 'API 1 key' },
    api2Name: { type: 'string', description: 'API 2 name' },
    api2Curl: { type: 'string', description: 'API 2 curl' },
    api2Key: { type: 'string', description: 'API 2 key' },
    api3Name: { type: 'string', description: 'API 3 name' },
    api3Curl: { type: 'string', description: 'API 3 curl' },
    api3Key: { type: 'string', description: 'API 3 key' },
  },
  outputs: {
    content: { type: 'string', description: 'Summary of generate/edit' },
    appName: { type: 'string', description: 'App name' },
    repoName: { type: 'string', description: 'Folder name under generated-apps/' },
    description: { type: 'string', description: 'Short description' },
    features: { type: 'json', description: 'Feature list' },
    outputPath: { type: 'string', description: 'Relative output path' },
    absoluteOutputPath: { type: 'string', description: 'Absolute disk path' },
    fileCount: { type: 'number', description: 'Files written' },
    uiMode: { type: 'string', description: 'form or chat' },
    combineMode: { type: 'string', description: 'Combine mode used' },
    apiCount: { type: 'number', description: 'Number of APIs wired' },
    apis: { type: 'json', description: 'Named APIs with wired flags' },
    previewHtml: { type: 'string', description: 'Static HTML preview' },
    previewPath: { type: 'string', description: 'Path to preview.html' },
  },
}

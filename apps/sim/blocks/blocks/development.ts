import { DevelopmentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { DevelopmentGenerateAppResponse } from '@/tools/development/types'

let _inflightRepoFetch: Promise<Array<{ label: string; id: string }>> | null = null

async function fetchDevelopmentRepos(): Promise<Array<{ label: string; id: string }>> {
  if (_inflightRepoFetch) {
    return _inflightRepoFetch
  }

  _inflightRepoFetch = (
    // boundary-raw-fetch: internal JSON GET for Development block repo dropdown hydration
    fetch('/api/tools/development/repos', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((data) => {
      _inflightRepoFetch = null
      if (!data?.success || !Array.isArray(data.repos)) {
        return []
      }

      return data.repos.map((repo: { id: string; name: string; source?: string }) => ({
        id: repo.id,
        label:repo.name,
      }))
    })
    .catch(() => {
      _inflightRepoFetch = null
      return []
    })
  )

  return _inflightRepoFetch
}

export const DevelopmentBlock: BlockConfig<DevelopmentGenerateAppResponse> = {
  type: 'development',
  name: 'Development',
  description: 'Generate or edit a production-ready Next.js app from your idea',
  longDescription:
    'Full-stack automation block that generates a Next.js App Router app, pushes to GitHub, deploys to Vercel from that repository, optionally provisions Neon Postgres + Prisma when persistence is needed, and returns the live deployment URL in block outputs. Edit mode loads an existing repository, applies your changes with full code context, then republishes.',
  bestPractices: `
  - Use Generate mode for new apps. Describe the app name, main features, pages, UI style, authentication needs, and API routes in User Input.
  - Use Edit mode to update an existing generated app. Pick a repository from the list, then describe the changes you want in User Input.
  - Set Repository Name (generate mode) to control the folder name under generated-apps/ (kebab-case).
  - Generated apps are always pushed to GitHub and deployed to Vercel (requires DEVELOPMENT_GITHUB_TOKEN and DEVELOPMENT_VERCEL_TOKEN in .env).
  - Optional .env: DEVELOPMENT_GITHUB_OWNER, DEVELOPMENT_VERCEL_TEAM_ID.
  - For database apps: set DEVELOPMENT_NEON_API_KEY (personal key from Neon Account settings) to auto-create a Neon DB per app. Use a console-managed org — not Vercel-managed Neon.
  - Connect User Input from a Starter block or upstream Agent output for dynamic generation or edits.
  `,
  docsLink: 'https://docs.sim.ai/blocks/development',
  category: 'blocks',
  integrationType: IntegrationType.DeveloperTools,
  tags: ['automation', 'agentic'],
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
        'Describe your app idea: name, features, pages, UI style, auth, APIs, env vars...',
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are an expert product engineer. Expand the user's app idea into a clear, actionable specification for generating a Next.js application.

Include:
- App name and purpose
- Main features and user flows
- Pages and routes needed
- Key components
- Data/state requirements
- UI style and design direction
- Authentication needs (if any)
- API routes and environment variables (if any)

Return ONLY the specification text. No markdown wrappers.`,
        placeholder: 'Describe the app you want to build...',
      },
    },
    {
      id: 'existingRepo',
      title: 'Repository',
      type: 'combobox',
      searchable: true,
      required: { field: 'operation', value: 'edit' },
      condition: { field: 'operation', value: 'edit' },
      description: 'Select an existing generated app repository to edit.',
      options: [],
      fetchOptions: async () => fetchDevelopmentRepos(),
      fetchOptionById: async (_blockId: string, optionId: string) => {
        const repos = await fetchDevelopmentRepos()
        const match = repos.find((repo) => repo.id === optionId)
        return match ?? { id: optionId, label: optionId }
      },
    },
    {
      id: 'repoName',
      title: 'Repository Name',
      type: 'short-input',
      placeholder: 'my-app (optional, kebab-case folder name)',
      description: 'Folder name under generated-apps/. Defaults from the app name if empty.',
      condition: { field: 'operation', value: 'generate' },
    },
    {
      id: 'privateRepo',
      title: 'Private Repository',
      type: 'switch',
      description: 'Create the GitHub repository as private',
      condition: { field: 'operation', value: 'generate' },
    },
  ],
  tools: {
    access: ['development_generate_app', 'development_edit_app'],
    config: {
      tool: (params) =>
        params.operation === 'edit' ? 'development_edit_app' : 'development_generate_app',
      params: (params) =>
        params.operation === 'edit'
          ? {
              userInput: params.userInput,
              repoName: params.existingRepo,
            }
          : {
              userInput: params.userInput,
              repoName: params.repoName,
              privateRepo: params.privateRepo === true,
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
      description: 'App idea, requirements, or edit instructions',
    },
    existingRepo: {
      type: 'string',
      description: 'Repository name of an existing generated app (edit mode)',
    },
    repoName: {
      type: 'string',
      description: 'Repository folder name for a new app (kebab-case, generate mode)',
    },
    privateRepo: { type: 'boolean', description: 'Whether the GitHub repository is private' },
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
      description: 'Whether npm install and npm run build succeeded in E2B',
    },
    buildOutput: {
      type: 'string',
      description: 'Build validation log output',
    },
    gitPushed: {
      type: 'boolean',
      description: 'Whether the generated app was pushed to GitHub',
    },
    githubHtmlUrl: {
      type: 'string',
      description: 'URL of the GitHub repository in the browser',
    },
    githubCloneUrl: {
      type: 'string',
      description: 'HTTPS clone URL of the GitHub repository',
    },
    githubOwner: {
      type: 'string',
      description: 'GitHub owner (user or org) of the remote repository',
    },
    githubRepoName: {
      type: 'string',
      description: 'GitHub repository name on the remote',
    },
    gitPushError: {
      type: 'string',
      description: 'Error message if push to GitHub was attempted but failed',
    },
    vercelDeployed: {
      type: 'boolean',
      description: 'Whether the app was deployed to Vercel successfully',
    },
    vercelUrl: {
      type: 'string',
      description: 'Live production URL of the deployed app (shown in workflow output)',
    },
    vercelDeploymentUrl: {
      type: 'string',
      description: 'Vercel deployment URL for this build',
    },
    vercelProjectId: {
      type: 'string',
      description: 'Vercel project ID',
    },
    vercelDeploymentId: {
      type: 'string',
      description: 'Vercel deployment ID',
    },
    vercelInspectorUrl: {
      type: 'string',
      description: 'Vercel deployment inspector URL in the dashboard',
    },
    vercelDeployError: {
      type: 'string',
      description: 'Error message if Vercel deployment was attempted but failed',
    },
    requiresDatabase: {
      type: 'boolean',
      description: 'Whether the generated app needs Neon Postgres persistence',
    },
    databaseProvisioned: {
      type: 'boolean',
      description: 'Whether Neon Postgres was provisioned and DATABASE_URL was set on Vercel',
    },
    neonProjectId: {
      type: 'string',
      description: 'Neon project ID when a database was provisioned',
    },
    databaseProvisionError: {
      type: 'string',
      description: 'Error message if database provisioning was required but failed',
    },
  },
}

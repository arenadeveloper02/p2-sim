import { mapGenerateAppResultToToolResponse } from '@/tools/development/map-generate-app-response'
import type {
  DevelopmentGenerateAppParams,
  DevelopmentGenerateAppResponse,
} from '@/tools/development/types'
import type { ToolConfig } from '@/tools/types'

export const arenaDevelopmentGenerateAppTool: ToolConfig<
  DevelopmentGenerateAppParams,
  DevelopmentGenerateAppResponse
> = {
  id: 'arena_development_generate_app',
  name: 'Generate Arena Next.js App',
  description:
    'Generate an iframe-ready Next.js app with emailId gate, push to GitHub, and deploy to Vercel',
  version: '1.0.0',

  params: {
    userInput: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'App idea, features, pages, UI style, auth needs, and any other requirements',
    },
    repoName: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Repository folder name (kebab-case). Derived from the app name if omitted',
    },
    privateRepo: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Create the GitHub repository as private',
      default: false,
    },
    referenceImage: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description: 'Optional design PDF — layout, theme, and styling follow the reference',
    },
  },

  request: {
    url: '/api/tools/development/generate',
    method: 'POST',
    timeout: 600_000,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      userInput: params.userInput,
      repoName: params.repoName,
      privateRepo: params.privateRepo,
      ...(params.referenceImage != null ? { referenceImage: params.referenceImage } : {}),
      arenaMode: true,
      workspaceId: params._context?.workspaceId,
      workflowId: params._context?.workflowId,
      executionId: params._context?.executionId,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      return mapGenerateAppResultToToolResponse({
        success: false,
        error: data.error ?? response.statusText,
      })
    }
    return mapGenerateAppResultToToolResponse(data)
  },

  outputs: {
    content: { type: 'string', description: 'Summary of the generation result' },
    appName: { type: 'string', description: 'Human-readable application name' },
    repoName: { type: 'string', description: 'Repository folder name that was created' },
    description: { type: 'string', description: 'Short description of the generated app' },
    features: {
      type: 'json',
      description: 'List of main features included in the generated app',
    },
    outputPath: {
      type: 'string',
      description: 'Relative path to the generated app inside the project (generated-apps/...)',
    },
    absoluteOutputPath: {
      type: 'string',
      description: 'Absolute filesystem path to the generated app folder',
      optional: true,
    },
    fileCount: { type: 'number', description: 'Number of files written' },
    buildValidated: {
      type: 'boolean',
      description:
        'Whether pre-deploy validation passed (full npm run build in E2B when E2B_API_KEY is set, otherwise local tsc --noEmit)',
      optional: true,
    },
    buildOutput: {
      type: 'string',
      description: 'Build validation log output',
      optional: true,
    },
    gitPushed: {
      type: 'boolean',
      description: 'Whether the generated app was pushed to GitHub',
      optional: true,
    },
    githubHtmlUrl: {
      type: 'string',
      description: 'URL of the GitHub repository',
      optional: true,
    },
    githubCloneUrl: {
      type: 'string',
      description: 'HTTPS clone URL of the GitHub repository',
      optional: true,
    },
    githubOwner: {
      type: 'string',
      description: 'GitHub owner of the remote repository',
      optional: true,
    },
    githubRepoName: {
      type: 'string',
      description: 'GitHub repository name on the remote',
      optional: true,
    },
    gitPushError: {
      type: 'string',
      description: 'Error message if GitHub push failed',
      optional: true,
    },
    vercelDeployed: {
      type: 'boolean',
      description: 'Whether the app was deployed to Vercel',
      optional: true,
    },
    vercelUrl: {
      type: 'string',
      description: 'Live production URL of the deployed app',
      optional: true,
    },
    vercelDeploymentUrl: {
      type: 'string',
      description: 'Vercel deployment URL',
      optional: true,
    },
    vercelProjectId: {
      type: 'string',
      description: 'Vercel project ID',
      optional: true,
    },
    vercelDeploymentId: {
      type: 'string',
      description: 'Vercel deployment ID',
      optional: true,
    },
    vercelInspectorUrl: {
      type: 'string',
      description: 'Vercel deployment inspector URL',
      optional: true,
    },
    vercelDeployError: {
      type: 'string',
      description: 'Error message if Vercel deployment failed',
      optional: true,
    },
    requiresDatabase: {
      type: 'boolean',
      description: 'Whether the generated app needs Neon Postgres persistence',
      optional: true,
    },
    databaseProvisioned: {
      type: 'boolean',
      description: 'Whether Neon Postgres was provisioned and DATABASE_URL was set on Vercel',
      optional: true,
    },
    neonProjectId: {
      type: 'string',
      description: 'Neon project ID when a database was provisioned',
      optional: true,
    },
    databaseProvisionError: {
      type: 'string',
      description: 'Error message if database provisioning was required but failed',
      optional: true,
    },
  },
}

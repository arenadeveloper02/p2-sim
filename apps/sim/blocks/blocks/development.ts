import { DevelopmentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { DevelopmentGenerateAppResponse } from '@/tools/development/types'

export const DevelopmentBlock: BlockConfig<DevelopmentGenerateAppResponse> = {
  type: 'development',
  name: 'Development',
  description: 'Generate a production-ready Next.js app from your idea',
  longDescription:
    'Full-stack automation block that generates a Next.js App Router app, pushes to GitHub, deploys to Vercel from that repository, optionally provisions Neon Postgres + Prisma when persistence is needed, and returns the live deployment URL in block outputs.',
  bestPractices: `
  - Describe the app name, main features, pages, UI style, authentication needs, and API routes in User Input.
  - Set Repository Name to control the folder name under generated-apps/ (kebab-case).
  - Generated apps are always pushed to GitHub and deployed to Vercel (requires DEVELOPMENT_GITHUB_TOKEN and DEVELOPMENT_VERCEL_TOKEN in .env).
  - Optional .env: DEVELOPMENT_GITHUB_OWNER, DEVELOPMENT_VERCEL_TEAM_ID.
  - For database apps: set DEVELOPMENT_NEON_API_KEY (personal key from Neon Account settings) to auto-create a Neon DB per app. Use a console-managed org — not Vercel-managed Neon.
  - Connect User Input from a Starter block or upstream Agent output for dynamic generation.
  `,
  docsLink: 'https://docs.sim.ai/blocks/development',
  category: 'blocks',
  integrationType: IntegrationType.DeveloperTools,
  tags: ['automation', 'agentic'],
  bgColor: '#0F172A',
  icon: DevelopmentIcon,
  subBlocks: [
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
      id: 'repoName',
      title: 'Repository Name',
      type: 'short-input',
      placeholder: 'my-app (optional, kebab-case folder name)',
      description: 'Folder name under generated-apps/. Defaults from the app name if empty.',
    },
    {
      id: 'privateRepo',
      title: 'Private Repository',
      type: 'switch',
      description: 'Create the GitHub repository as private',
    },
  ],
  tools: {
    access: ['development_generate_app'],
    config: {
      tool: () => 'development_generate_app',
      params: (params) => ({
        userInput: params.userInput,
        repoName: params.repoName,
        privateRepo: params.privateRepo === true,
      }),
    },
  },
  inputs: {
    userInput: {
      type: 'string',
      description: 'App idea and requirements for the generated Next.js application',
    },
    repoName: {
      type: 'string',
      description: 'Repository folder name (kebab-case)',
    },
    privateRepo: { type: 'boolean', description: 'Whether the GitHub repository is private' },
  },
  outputs: {
    content: { type: 'string', description: 'Summary of the generation result' },
    appName: { type: 'string', description: 'Human-readable application name' },
    repoName: { type: 'string', description: 'Repository folder name that was created' },
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

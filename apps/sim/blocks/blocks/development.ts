import { DevelopmentIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { IntegrationType } from '@/blocks/types'
import type { DevelopmentGenerateAppResponse } from '@/tools/development/types'

export const DevelopmentBlock: BlockConfig<DevelopmentGenerateAppResponse> = {
  type: 'development',
  name: 'Development',
  description: 'Generate a production-ready Next.js app from your idea',
  longDescription:
    'Full-stack automation block that generates a Next.js App Router app, validates the build, pushes to GitHub, deploys to Vercel from that repository, and returns the live deployment URL in block outputs.',
  bestPractices: `
  - Describe the app name, main features, pages, UI style, authentication needs, and API routes in User Input.
  - Set Repository Name to control the folder name under generated-apps/ (kebab-case).
  - Build validation is temporarily disabled; generated files are written without local npm build/repair loops.
  - Enable Push to GitHub with a personal access token (repo scope), then Deploy to Vercel to publish from that repo. The live URL appears in the vercelUrl output.
  - Vercel requires the GitHub integration on your Vercel account so the API can link the repository.
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
      id: 'pushToGit',
      title: 'Push to GitHub',
      type: 'switch',
      description:
        'Create a new GitHub repository and push the generated app (requires GitHub Token or GITHUB_TOKEN env)',
    },
    {
      id: 'githubToken',
      title: 'GitHub Token',
      type: 'short-input',
      placeholder: 'ghp_... (repo scope)',
      password: true,
      description: 'Personal access token with repo scope. Falls back to GITHUB_TOKEN env if empty.',
      condition: { field: 'pushToGit', value: true },
    },
    {
      id: 'githubOwner',
      title: 'GitHub Owner',
      type: 'short-input',
      placeholder: 'username or org (optional)',
      description: 'GitHub user or organization for the new repo. Defaults to the token owner.',
      condition: { field: 'pushToGit', value: true },
    },
    {
      id: 'privateRepo',
      title: 'Private Repository',
      type: 'switch',
      description: 'Create the GitHub repository as private',
      condition: { field: 'pushToGit', value: true },
    },
    {
      id: 'deployToVercel',
      title: 'Deploy to Vercel',
      type: 'switch',
      description:
        'Deploy the GitHub repository to Vercel production after push (requires Push to GitHub and Vercel token)',
      condition: { field: 'pushToGit', value: true },
    },
    {
      id: 'vercelToken',
      title: 'Vercel Token',
      type: 'short-input',
      placeholder: 'vercel_...',
      password: true,
      description:
        'Vercel access token. Falls back to VERCEL_TOKEN env if empty. Requires GitHub linked on Vercel.',
      condition: { field: 'deployToVercel', value: true },
    },
    {
      id: 'vercelTeamId',
      title: 'Vercel Team ID',
      type: 'short-input',
      placeholder: 'team_... (optional)',
      description: 'Vercel team ID when deploying to a team instead of your personal account',
      condition: { field: 'deployToVercel', value: true },
    },
    {
      id: 'validateBuild',
      title: 'Validate Build',
      type: 'switch',
      description:
        'Reserved for future use. Local npm build validation and LLM repair loops are currently disabled.',
    },
  ],
  tools: {
    access: ['development_generate_app'],
    config: {
      tool: () => 'development_generate_app',
      params: (params) => ({
        userInput: params.userInput,
        repoName: params.repoName,
        validateBuild: false,
        pushToGit: params.pushToGit === true,
        githubToken: params.githubToken,
        githubOwner: params.githubOwner,
        privateRepo: params.privateRepo === true,
        deployToVercel: params.deployToVercel === true,
        vercelToken: params.vercelToken,
        vercelTeamId: params.vercelTeamId,
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
    validateBuild: {
      type: 'boolean',
      description: 'Whether to validate npm install and build in E2B',
    },
    pushToGit: {
      type: 'boolean',
      description: 'Whether to create a GitHub repo and push the generated app',
    },
    githubToken: { type: 'string', description: 'GitHub personal access token' },
    githubOwner: { type: 'string', description: 'GitHub user or org for the new repository' },
    privateRepo: { type: 'boolean', description: 'Whether the GitHub repository is private' },
    deployToVercel: {
      type: 'boolean',
      description: 'Whether to deploy the GitHub repo to Vercel after push',
    },
    vercelToken: { type: 'string', description: 'Vercel access token' },
    vercelTeamId: { type: 'string', description: 'Optional Vercel team ID' },
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
  },
}

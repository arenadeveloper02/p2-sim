import type { ToolResponse } from '@/tools/types'

export interface DevelopmentGenerateAppParams {
  userInput: string
  repoName?: string
  privateRepo?: boolean
  referenceImage?: object
}

export interface DevelopmentEditAppParams {
  userInput: string
  repoName: string
  referenceImage?: object
}

export interface DevelopmentGenerateAppResponse extends ToolResponse {
  output: {
    content: string
    appName: string | null
    repoName: string | null
    description: string | null
    features: string[] | null
    outputPath: string | null
    absoluteOutputPath: string | null
    fileCount: number | null
    buildValidated: boolean | null
    buildOutput: string | null
    gitPushed: boolean | null
    githubHtmlUrl: string | null
    githubCloneUrl: string | null
    githubOwner: string | null
    githubRepoName: string | null
    gitPushError: string | null
    vercelDeployed: boolean | null
    vercelUrl: string | null
    vercelDeploymentUrl: string | null
    vercelProjectId: string | null
    vercelDeploymentId: string | null
    vercelInspectorUrl: string | null
    vercelDeployError: string | null
    requiresDatabase: boolean | null
    databaseProvisioned: boolean | null
    neonProjectId: string | null
    databaseProvisionError: string | null
  }
}

export type DevelopmentEditAppResponse = DevelopmentGenerateAppResponse

import type { GenerateNextjsAppResult } from '@/lib/development/nextjs-app-generator'
import type { DevelopmentGenerateAppResponse } from '@/tools/development/types'

/**
 * Maps API / generator result JSON into the Development block tool response shape.
 */
export function mapGenerateAppResultToToolResponse(
  data: GenerateNextjsAppResult
): DevelopmentGenerateAppResponse {
  if (!data.success) {
    const wroteFiles =
      (data.fileCount ?? 0) > 0 && Boolean(data.outputPath || data.absoluteOutputPath)
    const pathHint = data.absoluteOutputPath ?? data.outputPath
    return {
      success: false,
      output: {
        content: wroteFiles
          ? `Wrote ${data.fileCount} files to ${pathHint}, but generation failed: ${data.error ?? 'Unknown error'}`
          : (data.error ?? 'Failed to generate Next.js app'),
        appName: data.appName ?? null,
        repoName: data.repoName ?? null,
        description: data.description ?? null,
        features: Array.isArray(data.features) ? data.features : null,
        outputPath: data.outputPath ?? null,
        absoluteOutputPath: data.absoluteOutputPath ?? null,
        fileCount: data.fileCount ?? null,
        buildValidated: data.buildValidated ?? null,
        buildOutput: data.buildOutput ?? null,
        gitPushed: data.gitPushed ?? null,
        githubHtmlUrl: data.githubHtmlUrl ?? null,
        githubCloneUrl: data.githubCloneUrl ?? null,
        githubOwner: data.githubOwner ?? null,
        githubRepoName: data.githubRepoName ?? null,
        gitPushError: data.gitPushError ?? null,
        vercelDeployed: data.vercelDeployed ?? null,
        vercelUrl: data.vercelUrl ?? null,
        vercelDeploymentUrl: data.vercelDeploymentUrl ?? null,
        vercelProjectId: data.vercelProjectId ?? null,
        vercelDeploymentId: data.vercelDeploymentId ?? null,
        vercelInspectorUrl: data.vercelInspectorUrl ?? null,
        vercelDeployError: data.vercelDeployError ?? null,
      },
      error: data.error,
    }
  }

  const features = Array.isArray(data.features) ? data.features : []
  const pathHint = data.absoluteOutputPath ?? data.outputPath
  const pathLabel = pathHint ? ` at ${pathHint}` : ''
  const buildLabel = data.buildValidated
    ? ' Build validation passed.'
    : data.buildOutput
      ? ` Build validation: ${data.buildOutput}`
      : ''
  const gitLabel = data.gitPushed
    ? ` Pushed to ${data.githubHtmlUrl}.`
    : data.gitPushError
      ? ` Git push failed: ${data.gitPushError}`
      : ''
  const vercelLabel = data.vercelDeployed
    ? ` Live app: ${data.vercelUrl}`
    : data.vercelDeployError
      ? ` Vercel deploy failed: ${data.vercelDeployError}`
      : ''
  const cleanupLabel =
    data.gitPushed && !data.absoluteOutputPath
      ? ' Local generated-apps copy removed after publish.'
      : ''

  return {
    success: true,
    output: {
      content: `Generated "${data.appName}" (${data.fileCount} files)${pathLabel}.${buildLabel}${gitLabel}${vercelLabel}${cleanupLabel}`,
      appName: data.appName ?? null,
      repoName: data.repoName ?? null,
      description: data.description ?? null,
      features,
      outputPath: data.outputPath ?? null,
      absoluteOutputPath: data.absoluteOutputPath ?? null,
      fileCount: data.fileCount ?? null,
      buildValidated: data.buildValidated ?? null,
      buildOutput: data.buildOutput ?? null,
      gitPushed: data.gitPushed ?? null,
      githubHtmlUrl: data.githubHtmlUrl ?? null,
      githubCloneUrl: data.githubCloneUrl ?? null,
      githubOwner: data.githubOwner ?? null,
      githubRepoName: data.githubRepoName ?? null,
      gitPushError: data.gitPushError ?? null,
      vercelDeployed: data.vercelDeployed ?? null,
      vercelUrl: data.vercelUrl ?? null,
      vercelDeploymentUrl: data.vercelDeploymentUrl ?? null,
      vercelProjectId: data.vercelProjectId ?? null,
      vercelDeploymentId: data.vercelDeploymentId ?? null,
      vercelInspectorUrl: data.vercelInspectorUrl ?? null,
      vercelDeployError: data.vercelDeployError ?? null,
    },
  }
}

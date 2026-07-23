import { formatBuildErrorsSummary } from '@/lib/development/format-generated-app-build-errors'
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
    const buildErrorSummary = data.buildOutput ? formatBuildErrorsSummary(data.buildOutput) : ''
    const buildErrorsLabel = buildErrorSummary ? `\n\nBuild errors:\n${buildErrorSummary}` : ''
    const vercelErrorLabel = data.vercelDeployError ? `\n\nVercel: ${data.vercelDeployError}` : ''
    const gitPushErrorLabel =
      data.gitPushError &&
      !data.vercelDeployError?.includes(data.gitPushError) &&
      data.gitPushError !== data.vercelDeployError
        ? `\n\nGit push: ${data.gitPushError}`
        : ''
    const baseError = data.error ?? 'Failed to generate Next.js app'
    return {
      success: false,
      output: {
        content: wroteFiles
          ? `Wrote ${data.fileCount} files to ${pathHint}, but generation failed: ${baseError}${buildErrorsLabel}${vercelErrorLabel}${gitPushErrorLabel}`
          : `${baseError}${buildErrorsLabel}${vercelErrorLabel}${gitPushErrorLabel}`,
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
        requiresDatabase: data.requiresDatabase ?? null,
        databaseProvisioned: data.databaseProvisioned ?? null,
        neonProjectId: data.neonProjectId ?? null,
        databaseProvisionError: data.databaseProvisionError ?? null,
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
  const databaseLabel = data.requiresDatabase
    ? data.databaseProvisioned
      ? ` Neon Postgres provisioned (${data.neonProjectId}).`
      : data.databaseProvisionError
        ? ` Database not provisioned: ${data.databaseProvisionError}`
        : ' Database required but not provisioned.'
    : ''
  const cleanupLabel =
    data.gitPushed && !data.absoluteOutputPath
      ? ' Local generated-apps copy removed after publish.'
      : ''

  const actionLabel = data.mode === 'edit' ? 'Updated' : 'Generated'

  return {
    success: true,
    output: {
      content: `${actionLabel} "${data.appName}" (${data.fileCount} files)${pathLabel}.${buildLabel}${gitLabel}${vercelLabel}${databaseLabel}${cleanupLabel}`,
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
      requiresDatabase: data.requiresDatabase ?? null,
      databaseProvisioned: data.databaseProvisioned ?? null,
      neonProjectId: data.neonProjectId ?? null,
      databaseProvisionError: data.databaseProvisionError ?? null,
    },
  }
}

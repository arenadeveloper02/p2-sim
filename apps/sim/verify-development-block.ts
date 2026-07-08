/**
 * One-shot end-to-end verification of the Development block pipeline.
 * Runs the same generateNextjsApp() the development_generate_app tool uses:
 * LLM codegen -> validation/repair -> GitHub push -> Vercel + Neon -> deploy.
 *
 * Usage: bun --env-file=../../.env verify-development-block.ts
 * Delete this file after verification.
 */
import { generateNextjsApp } from '@/lib/development/nextjs-app-generator'

const startedAt = Date.now()

const result = await generateNextjsApp({
  userInput: [
    'App name: Trail Log.',
    'A simple hiking trip journal.',
    'Pages: a landing page describing the app, and a /trips page where users can add a trip',
    '(trail name, date, distance in km, short notes) via a form and see all trips in a list',
    'with newest first. Persist trips in the database. Clean, minimal outdoorsy UI with Tailwind.',
    'No authentication needed.',
  ].join(' '),
  repoName: 'trail-log-verify',
  privateRepo: false,
})

const durationMin = ((Date.now() - startedAt) / 60_000).toFixed(1)

console.log('=== DEVELOPMENT BLOCK VERIFICATION RESULT ===')
console.log(
  JSON.stringify(
    {
      durationMin,
      success: result.success,
      error: result.error,
      appName: result.appName,
      repoName: result.repoName,
      fileCount: result.fileCount,
      buildValidated: result.buildValidated,
      gitPushed: result.gitPushed,
      githubHtmlUrl: result.githubHtmlUrl,
      gitPushError: result.gitPushError,
      vercelDeployed: result.vercelDeployed,
      vercelUrl: result.vercelUrl,
      vercelInspectorUrl: result.vercelInspectorUrl,
      vercelDeployError: result.vercelDeployError,
      requiresDatabase: result.requiresDatabase,
      databaseProvisioned: result.databaseProvisioned,
      neonProjectId: result.neonProjectId,
      databaseProvisionError: result.databaseProvisionError,
    },
    null,
    2
  )
)

process.exit(result.success ? 0 : 1)

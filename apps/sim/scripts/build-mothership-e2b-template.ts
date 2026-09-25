#!/usr/bin/env bun

/**
 * Builds (or rebuilds) the Mothership / Arena Copilot E2B shell template under a
 * stable alias so `MOTHERSHIP_E2B_TEMPLATE_ID` stays the same when you add PyPI,
 * apt, or npm packages (including `mmdc` / Mermaid CLI).
 *
 * Usage (updates the already-configured MOTHERSHIP_E2B_TEMPLATE_ID in place):
 *   E2B_API_KEY=... bun run apps/sim/scripts/build-mothership-e2b-template.ts \
 *     [--name <existing-alias>] \
 *     [--base-template <existing-alias-or-code-interpreter-v1>] \
 *     [--pip 'package==1.2.3']... \
 *     [--no-cache] \
 *     [--no-write-env]
 *
 * Defaults:
 *   --name          = current MOTHERSHIP_E2B_TEMPLATE_ID (same id, not a new one)
 *   --base-template = that same id (layer packages onto the existing image)
 *
 * After a successful build the script rewrites the same alias into
 * `apps/sim/.env` and the repo-root `.env` when those files exist.
 */

import { defaultBuildLogger, Template, waitForTimeout } from '@e2b/code-interpreter'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import {
  defaultMothershipEnvPaths,
  MOTHERSHIP_E2B_ENV_KEY,
  parseMothershipBuildArgs,
  writeMothershipTemplateEnv,
} from '@/scripts/mothership-e2b-release'
import {
  MOTHERSHIP_APT_PACKAGES,
  MOTHERSHIP_COMMANDS_ASSERT,
  MOTHERSHIP_MERMAID_SETUP,
  MOTHERSHIP_MERMAID_SMOKE_ASSERT,
  MOTHERSHIP_NPM_CLI_PACKAGES,
  MOTHERSHIP_PYTHON_IMPORTS_ASSERT,
  MOTHERSHIP_SANDBOX_CPU_COUNT,
  MOTHERSHIP_SANDBOX_MEMORY_MB,
  mergeMothershipPipPackages,
} from '@/scripts/mothership-sandbox-packages'

const logger = createLogger('BuildMothershipE2BTemplate')
const START_COMMAND = 'sleep infinity'

async function main(): Promise<void> {
  if (!process.env.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is required')
  }

  const args = parseMothershipBuildArgs(process.argv.slice(2))
  const pipPackages = mergeMothershipPipPackages(args.pipExtras)

  const mothershipTemplate = Template()
    .fromTemplate(args.baseTemplate)
    .aptInstall([...MOTHERSHIP_APT_PACKAGES])
    .pipInstall(pipPackages)
    .npmInstall([...MOTHERSHIP_NPM_CLI_PACKAGES], { g: true })
    .runCmd(MOTHERSHIP_MERMAID_SETUP, { user: 'root' })
    .runCmd(MOTHERSHIP_COMMANDS_ASSERT, { user: 'root' })
    .runCmd(MOTHERSHIP_PYTHON_IMPORTS_ASSERT, { user: 'root' })
    .runCmd(MOTHERSHIP_MERMAID_SMOKE_ASSERT, { user: 'root' })
    .setStartCmd(START_COMMAND, waitForTimeout(1_000))

  logger.info('Building Mothership E2B template', {
    templateName: args.templateName,
    baseTemplate: args.baseTemplate,
    pipPackageCount: pipPackages.length,
    npmPackageCount: MOTHERSHIP_NPM_CLI_PACKAGES.length,
    cpuCount: MOTHERSHIP_SANDBOX_CPU_COUNT,
    memoryMB: MOTHERSHIP_SANDBOX_MEMORY_MB,
    skipCache: args.skipCache,
    writeEnv: args.writeEnv,
  })

  const result = await Template.build(mothershipTemplate, args.templateName, {
    cpuCount: MOTHERSHIP_SANDBOX_CPU_COUNT,
    memoryMB: MOTHERSHIP_SANDBOX_MEMORY_MB,
    onBuildLogs: defaultBuildLogger(),
    ...(args.skipCache ? { skipCache: true } : {}),
  })

  logger.info('Built Mothership E2B template', {
    templateName: args.templateName,
    templateId: result.templateId,
    buildId: result.buildId,
    configuration: `${MOTHERSHIP_E2B_ENV_KEY}=${args.templateName}`,
    note: 'Alias stays fixed across rebuilds; Sandbox.create resolves the latest build.',
  })

  if (args.writeEnv) {
    const written = await writeMothershipTemplateEnv(args.templateName, defaultMothershipEnvPaths())
    logger.info('Wrote mothership template alias to env', {
      key: MOTHERSHIP_E2B_ENV_KEY,
      value: args.templateName,
      files: written,
    })
  }
}

main().catch((error: unknown) => {
  logger.error('Mothership E2B template build failed', { error: getErrorMessage(error) })
  process.exitCode = 1
})

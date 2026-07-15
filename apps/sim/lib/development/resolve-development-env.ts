import { getEnv } from '@/lib/core/config/env'

/** Development block always generates Prisma-backed apps and provisions Neon Postgres per repo. */
export const DEVELOPMENT_REQUIRES_DATABASE = true

export interface DevelopmentDeployEnv {
  githubToken?: string
  githubOwner?: string
  vercelToken?: string
  vercelTeamId?: string
  neonIntegrationConfigurationId?: string
  neonApiKey?: string
  neonOrgId?: string
}

/**
 * Reads a Development block env var at runtime.
 * Uses dynamic process.env access so Next.js does not inline stale values at compile time.
 */
function readDevelopmentEnv(name: string): string | undefined {
  return getEnv(name)?.trim() || process.env[name]?.trim()
}

/**
 * Resolves GitHub and Vercel credentials for the Development block from dedicated env vars.
 */
export function resolveDevelopmentDeployEnv(): DevelopmentDeployEnv {
  return {
    githubToken: readDevelopmentEnv('DEVELOPMENT_GITHUB_TOKEN'),
    githubOwner: readDevelopmentEnv('DEVELOPMENT_GITHUB_OWNER'),
    vercelToken: readDevelopmentEnv('DEVELOPMENT_VERCEL_TOKEN'),
    vercelTeamId: readDevelopmentEnv('DEVELOPMENT_VERCEL_TEAM_ID'),
    neonIntegrationConfigurationId: readDevelopmentEnv(
      'DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID'
    ),
    neonApiKey: readDevelopmentEnv('DEVELOPMENT_NEON_API_KEY'),
    neonOrgId: readDevelopmentEnv('DEVELOPMENT_NEON_ORG_ID'),
  }
}

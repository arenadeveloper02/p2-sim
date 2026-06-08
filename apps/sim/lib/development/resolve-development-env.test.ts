/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDevelopmentDeployEnv } from '@/lib/development/resolve-development-env'

describe('resolveDevelopmentDeployEnv', () => {
  afterEach(() => {
    delete process.env.DEVELOPMENT_GITHUB_TOKEN
    delete process.env.DEVELOPMENT_GITHUB_OWNER
    delete process.env.DEVELOPMENT_VERCEL_TOKEN
    delete process.env.DEVELOPMENT_VERCEL_TEAM_ID
    delete process.env.DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID
    delete process.env.DEVELOPMENT_NEON_API_KEY
    delete process.env.DEVELOPMENT_NEON_ORG_ID
  })

  it('reads Development block credentials from dedicated process.env vars', () => {
    process.env.DEVELOPMENT_GITHUB_TOKEN = 'ghp_test'
    process.env.DEVELOPMENT_GITHUB_OWNER = 'acme'
    process.env.DEVELOPMENT_VERCEL_TOKEN = 'vercel_test'
    process.env.DEVELOPMENT_VERCEL_TEAM_ID = 'team_123'
    process.env.DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID = 'icfg_test'
    process.env.DEVELOPMENT_NEON_API_KEY = 'neon_test'
    process.env.DEVELOPMENT_NEON_ORG_ID = 'org_test'

    expect(resolveDevelopmentDeployEnv()).toEqual({
      githubToken: 'ghp_test',
      githubOwner: 'acme',
      vercelToken: 'vercel_test',
      vercelTeamId: 'team_123',
      neonIntegrationConfigurationId: 'icfg_test',
      neonApiKey: 'neon_test',
      neonOrgId: 'org_test',
    })
  })
})

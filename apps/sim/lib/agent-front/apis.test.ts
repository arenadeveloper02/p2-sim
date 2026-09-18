/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  normalizeAgentFrontApis,
  parseExecuteUrlFromCurl,
  redactCurlForPrompt,
  slugifyApiName,
} from '@/lib/agent-front/apis'
import { buildAgentFrontEnvFiles, buildAgentFrontRunRoute } from '@/lib/agent-front/scaffold'

describe('agent-front apis', () => {
  it('parses execute URL from curl', () => {
    expect(
      parseExecuteUrlFromCurl(
        `curl -X POST 'https://example.com/api/workflows/abc/execute' -H 'X-API-Key: secret'`
      )
    ).toBe('https://example.com/api/workflows/abc/execute')
  })

  it('normalizes up to three APIs and skips empty rows', () => {
    const { apis, error } = normalizeAgentFrontApis([
      {
        name: 'Enrichment',
        curl: 'curl https://a.example/execute',
        apiKey: 'key-a',
      },
      { name: '', curl: '' },
      {
        name: 'Intent',
        curl: "curl 'https://b.example/execute'",
        apiKey: 'key-b',
      },
    ])
    expect(error).toBeUndefined()
    expect(apis).toHaveLength(2)
    expect(apis[0].slug).toBe('enrichment')
    expect(apis[0].envUrlKey).toBe('SIM_EXECUTE_URL_ENRICHMENT')
    expect(apis[1].slug).toBe('intent')
  })

  it('errors when no curls provided', () => {
    const { error } = normalizeAgentFrontApis([{ curl: '' }, { curl: '' }])
    expect(error).toMatch(/at least one api curl/i)
  })

  it('slugifies and redacts', () => {
    expect(slugifyApiName('My API!', 1)).toBe('my-api')
    expect(redactCurlForPrompt(`curl -H 'X-API-Key: secret-value' https://x`)).toContain('***')
  })
})

describe('agent-front scaffold', () => {
  it('builds env files and run route for parallel combine', () => {
    const { apis } = normalizeAgentFrontApis([
      { name: 'A', curl: 'curl https://a.example/run', apiKey: 'ka' },
      { name: 'B', curl: 'curl https://b.example/run', apiKey: 'kb' },
    ])
    const env = buildAgentFrontEnvFiles(apis)
    expect(env.envExample).toContain('SIM_EXECUTE_URL_A')
    expect(env.envWithKeys).toContain('ka')

    const route = buildAgentFrontRunRoute(apis, 'parallel')
    expect(route).toContain('COMBINE_MODE = "parallel"')
    expect(route).toContain('Promise.all')
  })
})

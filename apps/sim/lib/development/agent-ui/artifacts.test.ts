/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseExecuteUrlFromCurl } from '@/lib/development/agent-ui/artifacts'

describe('parseExecuteUrlFromCurl', () => {
  it('extracts the workflow execute URL from a curl command', () => {
    const curl =
      'curl -X POST -H "X-API-Key: secret" -H "Content-Type: application/json" https://www.staging.sim.ai/api/workflows/abc/execute'
    expect(parseExecuteUrlFromCurl(curl)).toBe(
      'https://www.staging.sim.ai/api/workflows/abc/execute'
    )
  })

  it('returns undefined when no URL is present', () => {
    expect(parseExecuteUrlFromCurl('curl -X POST')).toBeUndefined()
  })
})

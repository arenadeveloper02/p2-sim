/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  appendAgentUiSystemPrompt,
  appendAgentUiUserInstructions,
  redactSecretsInCurl,
} from '@/lib/development/agent-ui/prompts'

describe('agent-ui prompts', () => {
  it('leaves the system prompt unchanged when agent UI mode is off', () => {
    expect(appendAgentUiSystemPrompt('base', { enabled: false })).toBe('base')
  })

  it('appends mandates when enabled and API wiring when curl is present', () => {
    const withoutCurl = appendAgentUiSystemPrompt('base', { enabled: true })
    expect(withoutCurl).toContain('Agent UI mandates')
    expect(withoutCurl).not.toContain('Workflow API wiring')

    const withCurl = appendAgentUiSystemPrompt('base', {
      enabled: true,
      apiCurl: 'curl -X POST https://example.com/api/workflows/abc/execute',
    })
    expect(withCurl).toContain('Workflow API wiring')
  })

  it('redacts X-API-Key values in curl strings', () => {
    expect(redactSecretsInCurl('curl -H "X-API-Key: secret-token" https://example.com')).toContain(
      'X-API-Key: $SIM_API_KEY'
    )
    expect(
      redactSecretsInCurl('curl -H "X-API-Key: secret-token" https://example.com')
    ).not.toContain('secret-token')
  })

  it('appends redacted curl instructions to the user prompt', () => {
    const result = appendAgentUiUserInstructions('Build a form', {
      enabled: true,
      apiCurl: 'curl -H "X-API-Key: secret-token" https://example.com/execute',
    })
    expect(result).toContain('Build a form')
    expect(result).toContain('$SIM_API_KEY')
    expect(result).not.toContain('secret-token')
  })
})

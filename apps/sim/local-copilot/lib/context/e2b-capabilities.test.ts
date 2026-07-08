/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/config/env-flags', () => ({
  isE2bEnabled: false,
  isE2BDocEnabled: false,
}))

import { getLocalCopilotE2bCapabilities } from '@/local-copilot/lib/context/e2b-capabilities'

describe('getLocalCopilotE2bCapabilities', () => {
  it('reports javascript-only when E2B is disabled', () => {
    const caps = getLocalCopilotE2bCapabilities()
    expect(caps.enabled).toBe(false)
    expect(caps.docSandboxEnabled).toBe(false)
    expect(caps.supportedCodeLanguages).toEqual(['javascript'])
  })
})

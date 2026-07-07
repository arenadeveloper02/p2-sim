/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetRotatingApiKey } = vi.hoisted(() => ({
  mockGetRotatingApiKey: vi.fn(),
}))

vi.mock('@/lib/core/config/api-keys', () => ({
  getRotatingApiKey: mockGetRotatingApiKey,
}))

import {
  getLocalCopilotAllowedEmails,
  getLocalCopilotConfig,
  isUserAllowedForLocalCopilot,
} from '@/local-copilot/lib/config'
const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.clearAllMocks()
})

describe('getLocalCopilotConfig api key resolution', () => {
  it('uses rotating Anthropic keys for anthropic provider and ignores COPILOT_API_KEY', () => {
    mockGetRotatingApiKey.mockReturnValue('sk-ant-test-key')
    process.env.COPILOT_PROVIDER = 'anthropic'
    process.env.COPILOT_API_KEY = 'sk-sim-copilot-test'

    expect(getLocalCopilotConfig().apiKey).toBe('sk-ant-test-key')
    expect(mockGetRotatingApiKey).toHaveBeenCalledWith('anthropic')
  })

  it('returns undefined when Anthropic rotation keys are not configured', () => {
    mockGetRotatingApiKey.mockImplementation(() => {
      throw new Error('No API keys configured for rotation')
    })
    process.env.COPILOT_PROVIDER = 'anthropic'

    expect(getLocalCopilotConfig().apiKey).toBeUndefined()
  })
})

describe('getLocalCopilotAllowedEmails', () => {
  it('parses comma-separated emails and domains', () => {
    process.env.COPILOT_ALLOWED_EMAILS = 'alice@example.com, @company.com ,bob@test.io'
    expect(getLocalCopilotAllowedEmails()).toEqual([
      'alice@example.com',
      '@company.com',
      'bob@test.io',
    ])
  })
})

describe('isUserAllowedForLocalCopilot', () => {
  it('allows any user when allowlist is unset and copilot is enabled', () => {
    process.env.COPILOT_ENABLED = 'true'
    delete process.env.COPILOT_ALLOWED_EMAILS
    expect(isUserAllowedForLocalCopilot('anyone@example.com')).toBe(true)
  })

  it('allows only listed emails when allowlist is set', () => {
    process.env.COPILOT_ENABLED = 'true'
    process.env.COPILOT_ALLOWED_EMAILS = 'pilot@example.com,@trusted.io'
    expect(isUserAllowedForLocalCopilot('pilot@example.com')).toBe(true)
    expect(isUserAllowedForLocalCopilot('member@trusted.io')).toBe(true)
    expect(isUserAllowedForLocalCopilot('other@example.com')).toBe(false)
  })

  it('denies all users when copilot is disabled', () => {
    process.env.COPILOT_ENABLED = 'false'
    process.env.COPILOT_ALLOWED_EMAILS = 'pilot@example.com'
    expect(isUserAllowedForLocalCopilot('pilot@example.com')).toBe(false)
  })
})

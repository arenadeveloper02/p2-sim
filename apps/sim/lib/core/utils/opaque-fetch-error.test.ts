/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatInternalToolFetchError,
  formatProviderNetworkError,
  isOpaqueFetchFailed,
} from '@/lib/core/utils/opaque-fetch-error'

describe('formatInternalToolFetchError', () => {
  it('unwraps undici fetch failed with a headers-timeout cause', () => {
    const cause = new Error('Headers Timeout Error')
    ;(cause as Error & { code?: string }).code = 'UND_ERR_HEADERS_TIMEOUT'
    const error = new TypeError('fetch failed', { cause })

    expect(isOpaqueFetchFailed(error)).toBe(true)
    expect(formatInternalToolFetchError(error, 1_500_000).message).toContain(
      'Headers Timeout Error'
    )
    expect(formatInternalToolFetchError(error, 1_500_000).message).toContain('1500000ms')
  })

  it('leaves unrelated errors unchanged', () => {
    const error = new Error('Draft not found')
    expect(isOpaqueFetchFailed(error)).toBe(false)
    expect(formatInternalToolFetchError(error, 1_000).message).toBe('Draft not found')
  })
})

describe('formatProviderNetworkError', () => {
  it('rewrites a bare fetch failed without a cause', () => {
    expect(
      formatProviderNetworkError(new TypeError('fetch failed'), 'Failed to generate app')
    ).toBe('Model request failed (connection closed or timed out). Retry the run.')
  })
})

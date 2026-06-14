/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  inferContextFromKey,
  isAbortError,
  isNetworkError,
  parseInternalFileUrl,
} from '@/lib/uploads/utils/file-utils'

describe('isAbortError', () => {
  it('returns true for AbortError-named errors', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(isAbortError(err)).toBe(true)
  })

  it('returns false for generic Errors', () => {
    expect(isAbortError(new Error('boom'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
})

describe('isNetworkError', () => {
  it.each([
    'fetch failed',
    'Network request failed',
    'connection reset',
    'request timeout',
    'operation timed out',
    'ECONNRESET while reading body',
  ])('matches transient message %s', (msg) => {
    expect(isNetworkError(new Error(msg))).toBe(true)
  })

  it('does not match deterministic errors', () => {
    expect(isNetworkError(new Error('Forbidden'))).toBe(false)
    expect(isNetworkError(new Error('Validation failed: name is required'))).toBe(false)
    expect(isNetworkError('not an error')).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('file-utils storage context inference', () => {
  it('recognizes agent-generated image storage keys', () => {
    expect(
      inferContextFromKey('agent-generated-images/workflow-id/user-id/generated-image.jpeg')
    ).toBe('agent-generated-images')
  })

  it('parses agent-generated image serve URLs', () => {
    expect(
      parseInternalFileUrl(
        '/api/files/serve/agent-generated-images%2Fworkflow-id%2Fuser-id%2Fgenerated-image.jpeg'
      )
    ).toEqual({
      key: 'agent-generated-images/workflow-id/user-id/generated-image.jpeg',
      context: 'agent-generated-images',
    })
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { isRemotePushAuthError, throwIfRemotePushAuthError } from './config'

describe('isRemotePushAuthError', () => {
  it('detects missing workflows permission rejections', () => {
    const error = new Error(
      "Command failed: git push origin upstream-sync/x\n ! [remote rejected] (refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission)"
    )
    expect(isRemotePushAuthError(error)).toBe(true)
  })

  it('ignores unrelated push failures', () => {
    expect(isRemotePushAuthError(new Error('fatal: unable to access: Could not resolve host'))).toBe(
      false
    )
  })
})

describe('throwIfRemotePushAuthError', () => {
  it('rethrows auth errors with an actionable message', () => {
    expect(() =>
      throwIfRemotePushAuthError(
        new Error('refusing to allow a GitHub App without `workflows` permission'),
        'Push sync branch'
      )
    ).toThrow(/write-all/)
  })

  it('does nothing for non-auth errors', () => {
    expect(() =>
      throwIfRemotePushAuthError(new Error('Connection timed out'), 'Push sync branch')
    ).not.toThrow()
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { isReact19ScriptTagWarning } from '@/app/_shell/suppress-react19-script-warning'

describe('isReact19ScriptTagWarning', () => {
  it('matches the React 19 script-in-component overlay message', () => {
    expect(
      isReact19ScriptTagWarning([
        'Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client.',
      ])
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isReact19ScriptTagWarning(['Hydration failed because the server rendered HTML'])).toBe(
      false
    )
  })
})

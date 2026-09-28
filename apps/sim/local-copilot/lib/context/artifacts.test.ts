/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_LOAD_MAX_CHARS,
  truncateArtifactBodyForModel,
} from '@/local-copilot/lib/context/artifacts'

describe('truncateArtifactBodyForModel', () => {
  it('passes through small string bodies', () => {
    expect(truncateArtifactBodyForModel('hello')).toBe('hello')
  })

  it('truncates huge string bodies so Claude thinking cannot stall', () => {
    const huge = 'x'.repeat(ARTIFACT_LOAD_MAX_CHARS + 5_000)
    const truncated = truncateArtifactBodyForModel(huge)
    expect(typeof truncated).toBe('string')
    expect((truncated as string).length).toBeLessThan(huge.length)
    expect(truncated as string).toContain('truncated')
  })

  it('truncates content fields on object bodies', () => {
    const result = truncateArtifactBodyForModel({
      path: 'files/AI_Testing_Dashboard_v2.html/content',
      content: 'y'.repeat(ARTIFACT_LOAD_MAX_CHARS + 1_000),
    }) as Record<string, unknown>
    expect(result.truncated).toBe(true)
    expect(typeof result.content).toBe('string')
    expect((result.content as string).length).toBeLessThan(ARTIFACT_LOAD_MAX_CHARS + 1_000)
  })
})

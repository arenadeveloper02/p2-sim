/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ThinkingDeltaBatcher } from '@/local-copilot/lib/agent/thinking-live-status'

describe('ThinkingDeltaBatcher', () => {
  it('holds tiny deltas until minChars then flushes', () => {
    const batcher = new ThinkingDeltaBatcher(10)
    expect(batcher.push('hello')).toBeNull()
    expect(batcher.push(' world!!')).toBe('hello world!!')
    expect(batcher.push('x')).toBeNull()
    expect(batcher.flush()).toBe('x')
  })
})

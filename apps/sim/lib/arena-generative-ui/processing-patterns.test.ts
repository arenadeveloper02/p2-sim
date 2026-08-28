/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  processingPatternPrompt,
  resolveProcessingPatterns,
} from '@/lib/arena-generative-ui/processing-patterns'

describe('processingPatternPrompt', () => {
  it('is empty when no patterns are selected', () => {
    expect(processingPatternPrompt([])).toBe('')
  })

  it('maps wait kinds onto capability recipes', () => {
    const prompt = processingPatternPrompt(['cancellable', 'long-running', 'short'])
    expect(prompt).toContain('CAPABILITY: LONG-RUNNING')
    expect(prompt).toContain('CAPABILITY: CANCELLABLE')
    expect(prompt.indexOf('LONG-RUNNING')).toBeLessThan(prompt.indexOf('CANCELLABLE'))
    expect(prompt).not.toContain('SHORT')
  })
})

describe('resolveProcessingPatterns', () => {
  it('emits no wait modules when nothing was planned', () => {
    expect(resolveProcessingPatterns({ archetype: 'form-result', bindings: [] })).toEqual([])
  })

  it('keeps wait tags on list-detail', () => {
    expect(
      resolveProcessingPatterns({
        archetype: 'list-detail',
        planned: ['long-running'],
        bindings: [{ kind: 'workflow' }],
      })
    ).toEqual(['long-running'])
  })

  it('selects long-running and cancellable', () => {
    expect(
      resolveProcessingPatterns({
        archetype: 'form-result',
        planned: ['long-running', 'cancellable'],
        bindings: [{ kind: 'workflow' }],
      })
    ).toEqual(['long-running', 'cancellable'])
  })

  it('infers streaming from a stream binding', () => {
    expect(
      resolveProcessingPatterns({
        archetype: 'form-result',
        planned: ['short'],
        bindings: [{ kind: 'http', stream: true }],
      })
    ).toEqual(['streaming'])
  })

  it('infers long-running from a workflow binding when the planner omitted processing', () => {
    expect(
      resolveProcessingPatterns({
        archetype: 'form-result',
        bindings: [{ kind: 'workflow' }],
      })
    ).toEqual(['long-running'])
  })
})

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

  it('composes form-result wait kinds in canonical order', () => {
    const prompt = processingPatternPrompt(['cancellable', 'long-running'])
    expect(prompt).toContain('PROCESSING PATTERN: LONG-RUNNING OPERATION')
    expect(prompt).toContain('PROCESSING PATTERN: CANCELLABLE')
    expect(prompt.indexOf('LONG-RUNNING')).toBeLessThan(prompt.indexOf('CANCELLABLE'))
    expect(prompt).not.toContain('SHORT OPERATION')
  })
})

describe('resolveProcessingPatterns', () => {
  it('defaults form-result to a short operation', () => {
    expect(resolveProcessingPatterns({ archetype: 'form-result', bindings: [] })).toEqual(['short'])
  })

  it('keeps list-detail off processing modules', () => {
    expect(
      resolveProcessingPatterns({
        archetype: 'list-detail',
        planned: ['long-running'],
        bindings: [{ kind: 'workflow' }],
      })
    ).toEqual([])
  })

  it('selects FORM_RESULT + LONG_RUNNING + CANCELLABLE', () => {
    expect(
      resolveProcessingPatterns({
        archetype: 'form-result',
        planned: ['long-running', 'cancellable'],
        bindings: [{ kind: 'workflow' }],
      })
    ).toEqual(['long-running', 'cancellable'])
  })

  it('infers streaming from a stream binding and drops short', () => {
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

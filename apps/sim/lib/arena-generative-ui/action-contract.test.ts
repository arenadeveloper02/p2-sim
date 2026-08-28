/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT } from '@/lib/arena-generative-ui/action-contract'

const PHASES = ['before', 'during', 'success', 'error'] as const

describe('ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT', () => {
  it('names every action phase', () => {
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toContain('ACTION CONTRACT')
    for (const phase of PHASES) {
      expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toContain(phase)
    }
  })

  it('tells during to keep context and not emit a spec Spinner', () => {
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(
      /during[^\n]*keeps the form and page visible/
    )
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(/during[^\n]*Spinner/)
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(/during[^\n]*Do not clear inputs/)
  })

  it('tells success not to emit a spec Toast', () => {
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(
      /success[^\n]*Do not emit a success Alert or Toast/
    )
  })

  it('tells error to keep input and Retry', () => {
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(/error[^\n]*Keep entered values/)
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(/error[^\n]*Retry/)
  })

  it('leaves destructive confirm to the host', () => {
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toMatch(/before[^\n]*do not emit Modal/)
  })

  it('keeps page onLoad on the data-state contract', () => {
    expect(ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT).toContain(
      'Page onLoad is DATA STATE CONTRACT, not this slot'
    )
  })
})

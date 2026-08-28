/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_DATA_STATE_PROMPT } from '@/lib/arena-generative-ui/data-state-contract'

const STATES = ['loading', 'empty', 'error', 'partial', 'success', 'stale'] as const

describe('ARENA_GENERATIVE_UI_DATA_STATE_PROMPT', () => {
  it('names every data state', () => {
    expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toContain('DATA STATE CONTRACT')
    for (const state of STATES) {
      expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toContain(state)
    }
  })

  it('tells empty to name what is missing and provide a next action', () => {
    expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toMatch(
      /empty[^\n]*EmptyState’s child is the next useful action/
    )
  })

  it('keeps error copy off HTTP internals', () => {
    expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toMatch(/error[^\n]*Do not mention HTTP status/)
  })

  it('tells loading not to emit a page-level Skeleton', () => {
    expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toMatch(
      /loading[^\n]*Do not emit a page-level Skeleton/
    )
  })

  it('tells stale to keep data and leave Refresh to the host', () => {
    expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toMatch(/stale[^\n]*Do not blank a region/)
    expect(ARENA_GENERATIVE_UI_DATA_STATE_PROMPT).toMatch(/stale[^\n]*Do not emit a Refresh Button/)
  })
})

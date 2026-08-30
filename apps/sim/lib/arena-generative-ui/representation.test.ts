/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT,
  parseArenaGenerativeRepresentation,
} from '@/lib/arena-generative-ui/representation'

describe('parseArenaGenerativeRepresentation', () => {
  it('accepts the closed enum and aliases, and fails unknown values open to auto', () => {
    expect(parseArenaGenerativeRepresentation('table')).toBe('table')
    expect(parseArenaGenerativeRepresentation('kanban')).toBe('kanban')
    expect(parseArenaGenerativeRepresentation('timeline')).toBe('timeline')
    expect(parseArenaGenerativeRepresentation('card')).toBe('cards')
    expect(parseArenaGenerativeRepresentation('kanban_board')).toBe('auto')
    expect(parseArenaGenerativeRepresentation('nope')).toBe('auto')
    expect(parseArenaGenerativeRepresentation(undefined)).toBe('auto')
  })
})

describe('ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT', () => {
  it('separates representation from archetype and forbids invented types', () => {
    expect(ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT).toContain('REPRESENTATION')
    expect(ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT).toContain('Archetype is the job')
    expect(ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT).toContain('No Kanban type')
    expect(ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT).toContain('No Timeline type')
    expect(ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT).not.toContain('collection = Table')
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT } from '@/lib/arena-generative-ui/anti-patterns'

describe('ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT', () => {
  it('names the anti-patterns layer', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toContain('ANTI-PATTERNS')
  })

  it('forbids hard-coded data, fake Stat, and decorative Sparkline', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /data[^\n]*Never hard-code dynamic data/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /stats[^\n]*Never create fake statistics/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /charts[^\n]*Never create a decorative Sparkline or Chart/
    )
  })

  it('forbids Table for narrative entities and Form without input', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /table[^\n]*Never use Table for narrative entities/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /form[^\n]*Never create a Form or SearchField when no user input is required/
    )
  })

  it('forbids Tabs for unrelated actions and nested Cards', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /tabs[^\n]*Never use Tabs for unrelated actions/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /cards[^\n]*Never nest Cards unnecessarily/
    )
  })

  it('forbids duplicate actionId and navigation without a destination', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(/calls[^\n]*Never duplicate API calls/)
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /nav[^\n]*Never create navigation without a destination/
    )
  })

  it('forbids loading without recovery, hidden errors, and hover-only actions', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /loading[^\n]*Never show loading indefinitely without recovery/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(/errors[^\n]*Never hide errors/)
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /hover[^\n]*Never use hover as the only way to discover actions/
    )
  })

  it('forbids unmarked destructive, dead Button, empty pagination, unused Filter, and inert SearchField', () => {
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /destructive[^\n]*Never place a destructive Button beside the primary without distinction/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /dead[^\n]*Never generate dead buttons/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /pages[^\n]*Never create pagination without enough data/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /filters[^\n]*Never create a Filter that does not affect data/
    )
    expect(ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT).toMatch(
      /search[^\n]*Never create a SearchField that does not modify the collection/
    )
  })
})

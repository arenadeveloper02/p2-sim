/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { closestDeclaredName } from '@/lib/arena-generative-ui/closest-declared'

describe('closestDeclaredName', () => {
  it('returns the exact declared spelling', () => {
    expect(closestDeclaredName('load_order', ['load_order', 'cancel_order'])).toBe('load_order')
  })

  it('matches case and snake/camel/hyphen as the same token', () => {
    expect(closestDeclaredName('Qualify_Lead', ['qualify_lead'])).toBe('qualify_lead')
    expect(closestDeclaredName('qualifyLead', ['qualify_lead'])).toBe('qualify_lead')
    expect(closestDeclaredName('qualify-lead', ['qualify_lead'])).toBe('qualify_lead')
  })

  it('returns a unique typo within edit distance 2', () => {
    expect(closestDeclaredName('run_histoy', ['run_history'])).toBe('run_history')
    expect(closestDeclaredName('qualify_led', ['qualify_lead'])).toBe('qualify_lead')
  })

  it('returns undefined on a tie', () => {
    expect(closestDeclaredName('ordr', ['order', 'ords'])).toBeUndefined()
  })

  it('does not guess when no unique close match exists', () => {
    expect(closestDeclaredName('invented_key', ['qualify_lead', 'score_lead'])).toBeUndefined()
    expect(closestDeclaredName('get_order', ['load_order', 'cancel_order'])).toBeUndefined()
  })

  it('remaps any invented key onto the only declared name when asked', () => {
    expect(
      closestDeclaredName('get_order', ['load_order'], { singleNameFallback: true })
    ).toBe('load_order')
    expect(
      closestDeclaredName('invented_key', ['qualify_lead'], { singleNameFallback: true })
    ).toBe('qualify_lead')
  })

  it('does not use single-name fallback for form fields by default', () => {
    expect(closestDeclaredName('notes', ['company'])).toBeUndefined()
  })

  it('returns undefined for empty candidate or declared list', () => {
    expect(closestDeclaredName('', ['load_order'])).toBeUndefined()
    expect(closestDeclaredName('load_order', [])).toBeUndefined()
  })
})

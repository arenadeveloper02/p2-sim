/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { isReplanEdit, plannerInputForReplan } from '@/lib/arena-generative-ui/replan-from-edit'

describe('isReplanEdit', () => {
  it('accepts explicit whole-app rebuild language', () => {
    expect(isReplanEdit('Re-plan this as a dashboard of weekly ops metrics.')).toBe(true)
    expect(isReplanEdit('Please replan from the original brief.')).toBe(true)
    expect(isReplanEdit('Start over as a three-step wizard.')).toBe(true)
    expect(isReplanEdit('Build this from scratch with a results page.')).toBe(true)
    expect(isReplanEdit('Rebuild the app as a company search.')).toBe(true)
    expect(isReplanEdit('Regenerate this app around the history list.')).toBe(true)
    expect(isReplanEdit('Replace the whole app with a list of orders.')).toBe(true)
    expect(isReplanEdit('Turn this into a dashboard.')).toBe(true)
    expect(isReplanEdit('Make this a wizard with company, role, then submit.')).toBe(true)
    expect(isReplanEdit('Change the app to list-detail.')).toBe(true)
  })

  it('rejects ordinary deltas that mention rebuild-like words locally', () => {
    expect(isReplanEdit('Centre the search row.')).toBe(false)
    expect(isReplanEdit('Rebuild the search row.')).toBe(false)
    expect(isReplanEdit('Regenerate the score Stat on results.')).toBe(false)
    expect(isReplanEdit('Make the results page cleaner.')).toBe(false)
    expect(isReplanEdit('Add a dashboard card under the KPIs.')).toBe(false)
    expect(isReplanEdit('Set the theme to dark mode.')).toBe(false)
    expect(isReplanEdit('')).toBe(false)
  })
})

describe('plannerInputForReplan', () => {
  it('leads with the new job and keeps the previous brief as background', () => {
    const input = plannerInputForReplan({
      editInstructions: 'Turn this into a dashboard of weekly ops.',
      existingBrief: 'Lead qualifier. Home is a form.',
    })
    expect(input).toContain('Re-plan request')
    expect(input.indexOf('Turn this into a dashboard')).toBeLessThan(
      input.indexOf('Lead qualifier')
    )
    expect(input).toContain('Previous product')
  })

  it('is just the request when the draft has no stored brief', () => {
    expect(
      plannerInputForReplan({ editInstructions: 'Start over as a wizard.' })
    ).toBe('Start over as a wizard.')
  })
})

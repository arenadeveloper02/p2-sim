/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { editImpact } from '@/lib/arena-generative-ui/edit-impact'
import { twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'

describe('editImpact', () => {
  it('treats a timing sentence as a host knob', () => {
    const impact = editImpact(twoPageManifest, 'Wait here until it succeeds')
    expect(impact.kind).toBe('knob')
    expect(impact.navigateWhen).toBe('success')
    expect(impact.pages).toEqual([])
  })

  it('replans both pages when the results surface moves', () => {
    const impact = editImpact(twoPageManifest, 'Show the score on this page')
    expect(impact.kind).toBe('partial-replan')
    expect(impact.pages).toEqual(expect.arrayContaining(['home', 'results']))
    expect(impact.summary).toContain('home: form')
    expect(impact.summary).toContain('results: article')
  })
})

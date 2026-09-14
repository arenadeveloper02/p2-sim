/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { describe, expect, it } from 'vitest'
import { twoPageManifest, twoPageResultsSpec } from '@/lib/arena-generative-ui/two-page-app.fixture'
import {
  applyWaitEstimateFromBrief,
  waitEstimateFromBrief,
} from '@/lib/arena-generative-ui/wait-estimate'

function resultsWithEstimate(estimate: string): Spec {
  const spec = structuredClone(twoPageResultsSpec)
  const section = spec.elements.section
  spec.elements.working = {
    type: 'WorkingCard',
    props: {
      title: 'Working…',
      steps: 'Scoring\nWriting',
      estimate,
      cancelTo: 'home',
    },
    children: [],
  }
  if (section && typeof section === 'object') {
    section.children = ['working', ...((section.children as string[] | undefined) ?? [])]
  }
  return spec
}

function manifestWithEstimate(estimate: string) {
  return {
    ...twoPageManifest,
    pages: {
      ...twoPageManifest.pages,
      results: {
        ...twoPageManifest.pages.results,
        spec: resultsWithEstimate(estimate),
      },
    },
  }
}

describe('waitEstimateFromBrief', () => {
  it('reads a take-duration from user input', () => {
    expect(
      waitEstimateFromBrief('Analyze a company. It might take 10 minutes to finish the report.')
    ).toBe('Usually takes about 10 minutes')
  })

  it('reads a minute range and an hour phrase', () => {
    expect(waitEstimateFromBrief('This generate job usually takes 10–15 minutes.')).toBe(
      'Usually takes 10–15 minutes'
    )
    expect(waitEstimateFromBrief('The analysis might take about an hour.')).toBe(
      'Usually takes about 1 hour'
    )
    expect(waitEstimateFromBrief('Expect this to take half an hour.')).toBe(
      'Usually takes about 30 minutes'
    )
  })

  it('ignores page counts and recurring intervals', () => {
    expect(waitEstimateFromBrief('Two pages. Refresh every 10 minutes.')).toBeUndefined()
    expect(waitEstimateFromBrief('Show 10 items on the table.')).toBeUndefined()
  })

  it('prefers the current ask over an older brief', () => {
    expect(
      waitEstimateFromBrief(
        'Make the cards smaller.',
        'Analyze a company. It might take 10 minutes.'
      )
    ).toBe('Usually takes about 10 minutes')
    expect(
      waitEstimateFromBrief(
        'This now takes 5 minutes.',
        'Analyze a company. It might take 10 minutes.'
      )
    ).toBe('Usually takes about 5 minutes')
  })
})

describe('applyWaitEstimateFromBrief', () => {
  it('overwrites gold 90–150s copy when the brief names 10 minutes', () => {
    const result = applyWaitEstimateFromBrief(
      manifestWithEstimate('Usually takes 90–150s'),
      'Deep research. This might take 10 minutes.'
    )
    expect(result.manifest.pages.results.spec.elements.working?.props?.estimate).toBe(
      'Usually takes about 10 minutes'
    )
    expect(result.adoptedChanges).toEqual([
      {
        code: 'wait-estimate',
        asked: 'Honour the job duration named in the brief.',
        adopted: 'WorkingCard estimate is "Usually takes about 10 minutes".',
      },
    ])
  })

  it('is a no-op when the brief has no duration', () => {
    const manifest = manifestWithEstimate('Usually takes 90–150s')
    const result = applyWaitEstimateFromBrief(manifest, 'Analyze a company.')
    expect(result.manifest).toBe(manifest)
    expect(result.adoptedChanges).toEqual([])
  })
})

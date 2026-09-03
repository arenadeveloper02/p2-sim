/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { unwrapPastedSample } from '@/lib/arena-generative-ui/output-schema'
import { schemaAnchors, unwrapPayloadToSchema } from '@/lib/arena-generative-ui/unwrap-to-schema'

const GAP_SCHEMA = [
  { name: 'gap_analysis', type: 'object' },
  { name: 'gap_analysis.coverage_gaps', type: 'array' },
  { name: 'enhanced_article', type: 'string' },
]

const BUSINESS = {
  gap_analysis: { coverage_gaps: [{ id: 'g1' }] },
  enhanced_article: 'Hi',
}

describe('schemaAnchors', () => {
  it('collects roots and array last segments', () => {
    expect([...schemaAnchors(GAP_SCHEMA)].sort()).toEqual([
      'coverage_gaps',
      'enhanced_article',
      'gap_analysis',
    ])
  })

  it('strips a common output. envelope prefix', () => {
    expect(
      [...schemaAnchors([
        { name: 'output', type: 'object' },
        { name: 'output.gap_analysis', type: 'object' },
        { name: 'output.gap_analysis.coverage_gaps', type: 'array' },
      ])].sort()
    ).toEqual(['coverage_gaps', 'gap_analysis'])
  })

  it('keeps a lone string output field as an anchor', () => {
    expect([...schemaAnchors([{ name: 'output', type: 'string' }])]).toEqual(['output'])
  })
})

describe('unwrapPayloadToSchema', () => {
  it('peels a log-shaped Response data envelope', () => {
    expect(unwrapPayloadToSchema({ data: BUSINESS }, GAP_SCHEMA)).toEqual(BUSINESS)
  })

  it('peels a network-tab paste with ok and nested data', () => {
    expect(
      unwrapPayloadToSchema({ ok: true, data: { data: BUSINESS } }, GAP_SCHEMA)
    ).toEqual(BUSINESS)
  })

  it('peels when the envelope has extra sibling keys', () => {
    expect(
      unwrapPayloadToSchema({ data: BUSINESS, success: true }, GAP_SCHEMA)
    ).toEqual(BUSINESS)
  })

  it('peels a singleton output object using output.* schema names', () => {
    expect(
      unwrapPayloadToSchema(
        { data: { output: BUSINESS } },
        [
          { name: 'output', type: 'object' },
          { name: 'output.gap_analysis', type: 'object' },
          { name: 'output.gap_analysis.coverage_gaps', type: 'array' },
        ]
      )
    ).toEqual(BUSINESS)
  })

  it('does not peel a string output on a history item', () => {
    const payload = {
      data: {
        history: [{ output: 'saved markdown', keyword: 'Dental' }],
      },
    }
    expect(
      unwrapPayloadToSchema(payload, [
        { name: 'history', type: 'array' },
        { name: 'history[].output', type: 'string' },
        { name: 'history[].keyword', type: 'string' },
      ])
    ).toEqual({ history: [{ output: 'saved markdown', keyword: 'Dental' }] })
  })

  it('does not drop a sibling score next to an output object', () => {
    const payload = { output: { items: [{ keyword: 'Nested' }] }, score: 3 }
    expect(unwrapPayloadToSchema(payload, [{ name: 'score', type: 'number' }])).toEqual(payload)
  })

  it('peels mechanical envelopes when schema is missing', () => {
    expect(unwrapPayloadToSchema({ data: BUSINESS, status: 200, headers: {} })).toEqual(BUSINESS)
    expect(unwrapPayloadToSchema({ ok: true, data: { data: BUSINESS } })).toEqual(BUSINESS)
  })

  it('still peels data when schema is Agent-shaped and does not match', () => {
    expect(
      unwrapPayloadToSchema({ data: BUSINESS }, [
        { name: 'content_type', type: 'string' },
        { name: 'core_theme', type: 'string' },
      ])
    ).toEqual(BUSINESS)
  })
})

describe('unwrapPastedSample singleton output', () => {
  it('matches unwrapPayloadToSchema for a log-shaped body', () => {
    expect(unwrapPastedSample({ data: BUSINESS })).toEqual(BUSINESS)
  })
})

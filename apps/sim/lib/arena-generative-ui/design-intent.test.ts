/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_CONTENT_TYPES,
  ARENA_GENERATIVE_EMPHASES,
  ARENA_GENERATIVE_INTENT_DENSITIES,
  ARENA_GENERATIVE_PRODUCT_TYPES,
  ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT,
  ARENA_GENERATIVE_VISUAL_TONES,
  normalizeDesignIntentDensity,
  parseArenaGenerativeDesignIntent,
} from '@/lib/arena-generative-ui/design-intent'

describe('ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT', () => {
  it('names the layer, every axis, and forbids component props', () => {
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('DESIGN INTENT')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('productType')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('density')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('visualTone')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('contentType')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('emphasis')
    for (const value of ARENA_GENERATIVE_PRODUCT_TYPES) {
      expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain(value)
    }
    for (const value of ARENA_GENERATIVE_INTENT_DENSITIES) {
      expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain(value)
    }
    for (const value of ARENA_GENERATIVE_VISUAL_TONES) {
      expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain(value)
    }
    for (const value of ARENA_GENERATIVE_CONTENT_TYPES) {
      expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain(value)
    }
    for (const value of ARENA_GENERATIVE_EMPHASES) {
      expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain(value)
    }
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('not emit them as component props')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('spacious means roomy')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).not.toContain('SearchField hero')
  })
})

describe('parseArenaGenerativeDesignIntent', () => {
  it('keeps a full valid object', () => {
    expect(
      parseArenaGenerativeDesignIntent({
        productType: 'analytics',
        density: 'compact',
        visualTone: 'technical',
        contentType: 'data-heavy',
        emphasis: 'data',
      })
    ).toEqual({
      productType: 'analytics',
      density: 'compact',
      visualTone: 'technical',
      contentType: 'data-heavy',
      emphasis: 'data',
    })
  })

  it('accepts snake_case keys and aliases spacious to roomy', () => {
    expect(
      parseArenaGenerativeDesignIntent({
        product_type: 'crm',
        density: 'spacious',
        visual_tone: 'premium',
        content_type: 'workflow',
        emphasis: 'discovery',
      })
    ).toEqual({
      productType: 'crm',
      density: 'roomy',
      visualTone: 'premium',
      contentType: 'workflow',
      emphasis: 'discovery',
    })
  })

  it('drops unknown axes and omits an empty result', () => {
    expect(
      parseArenaGenerativeDesignIntent({ productType: 'erp', density: 'cozy' })
    ).toBeUndefined()
    expect(parseArenaGenerativeDesignIntent({ productType: 'finance', mood: 'loud' })).toEqual({
      productType: 'finance',
    })
    expect(parseArenaGenerativeDesignIntent(null)).toBeUndefined()
    expect(parseArenaGenerativeDesignIntent('analytics')).toBeUndefined()
  })
})

describe('normalizeDesignIntentDensity', () => {
  it('aliases spacious to roomy and drops unknown values', () => {
    expect(normalizeDesignIntentDensity('spacious')).toBe('roomy')
    expect(normalizeDesignIntentDensity('roomy')).toBe('roomy')
    expect(normalizeDesignIntentDensity('cozy')).toBeUndefined()
  })
})

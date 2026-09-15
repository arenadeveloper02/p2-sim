/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ARENA_GENERATIVE_INTENT_DENSITIES,
  ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT,
  ARENA_GENERATIVE_VISUAL_TONES,
  normalizeDesignIntentDensity,
  parseArenaGenerativeDesignIntent,
  stampThemeFromIntent,
  themeAndRecipeHintsFromIntent,
} from '@/lib/arena-generative-ui/design-intent'

describe('ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT', () => {
  it('names the layer, every axis, and forbids component props', () => {
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('DESIGN INTENT')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('density')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('tone')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('visualPriority')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('interactionStyle')
    expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain('productType')
    for (const value of ARENA_GENERATIVE_INTENT_DENSITIES) {
      expect(ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT).toContain(value)
    }
    for (const value of ARENA_GENERATIVE_VISUAL_TONES) {
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
      tone: 'technical',
      contentType: 'data-heavy',
      emphasis: 'data',
      visualPriority: 'data',
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
      tone: 'premium',
      contentType: 'workflow',
      emphasis: 'discovery',
      visualPriority: 'discovery',
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

describe('themeAndRecipeHintsFromIntent', () => {
  it('stamps roomy strong ink for marketing or editorial', () => {
    expect(themeAndRecipeHintsFromIntent({ productType: 'marketing' }).theme).toEqual({
      density: 'roomy',
      ink: 'strong',
    })
    expect(themeAndRecipeHintsFromIntent({ tone: 'editorial' }).theme).toEqual({
      density: 'roomy',
      ink: 'strong',
    })
  })

  it('prefers muted cards for premium and tables when scannable', () => {
    const hints = themeAndRecipeHintsFromIntent({
      tone: 'premium',
      interactionStyle: 'scannable',
      visualPriority: 'data',
    })
    expect(hints.preferMutedCards).toBe(true)
    expect(hints.preferTableOverCards).toBe(true)
    expect(hints.goldKind).toBe('performance')
  })

  it('picks briefing gold for content visualPriority', () => {
    expect(themeAndRecipeHintsFromIntent({ visualPriority: 'content' }).goldKind).toBe('briefing')
  })
})

describe('stampThemeFromIntent', () => {
  it('applies marketing density and lets Design Notes win', () => {
    expect(
      stampThemeFromIntent({ density: 'comfortable' }, { productType: 'marketing' }).density
    ).toBe('roomy')
    expect(
      stampThemeFromIntent(
        { density: 'comfortable' },
        { productType: 'marketing' },
        'Use compact density'
      ).density
    ).toBe('compact')
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildIdeogramJsonPrompt,
  createDefaultIdeogramPromptBuilderValue,
  estimateIdeogramTokenCount,
  formatIdeogramJsonPrompt,
  ideogramV4JsonPromptToBuilderValue,
  normalizeIdeogramPalette,
  parseIdeogramPromptBuilderValue,
  parseImportedIdeogramJsonText,
  repairIdeogramJsonText,
  resolveElementPalette,
} from '@/lib/ideogram/build-json-prompt'

describe('buildIdeogramJsonPrompt', () => {
  it('serializes a minimal valid prompt without high-level description', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      background: 'Soft gradient studio backdrop',
      elements: [
        {
          id: 'el-1',
          type: 'text' as const,
          text: 'SUMMER SALE',
          desc: 'Bold headline across the top',
          bbox: [50, 100, 150, 900] as const,
        },
      ],
    }

    const result = buildIdeogramJsonPrompt(value)

    expect(result.jsonPrompt.high_level_description).toBeUndefined()
    expect(result.jsonPrompt.compositional_deconstruction.background).toBe('Soft gradient studio backdrop')
    expect(result.jsonPrompt.compositional_deconstruction.elements).toEqual([
      {
        type: 'text',
        text: 'SUMMER SALE',
        desc: 'Bold headline across the top',
        bbox: [50, 100, 150, 900],
      },
    ])
    expect(result.metadata.elementCount).toBe(1)
    expect(result.promptPreview).toContain('SUMMER SALE')
    expect(result.metadata.tokenEstimate).toBeGreaterThan(0)
  })

  it('includes high_level_description only when non-empty', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      highLevelDescription: 'A cinematic product poster',
      background: 'Studio',
      elements: [],
    }

    const result = buildIdeogramJsonPrompt(value)
    expect(result.jsonPrompt.high_level_description).toBe('A cinematic product poster')
  })

  it('requires style trio when style description is provided in none mode', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      background: 'Blue sky',
      styleDescription: {
        aesthetics: 'Minimal',
        lighting: '',
        medium: 'Digital illustration',
      },
      elements: [],
    }

    expect(() => buildIdeogramJsonPrompt(value)).toThrow('lighting is required')
  })

  it('emits color_palette and keeps shape hints in desc', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      background: 'Dark studio',
      elements: [
        {
          id: 'visible',
          type: 'obj' as const,
          desc: 'Main product centered',
          palette: ['#FF3366', '#112233'],
          shape: 'ellipse' as const,
          bbox: [200, 300, 700, 800] as const,
        },
        {
          id: 'hidden',
          type: 'text' as const,
          text: 'DRAFT',
          desc: 'Draft label',
          hidden: true,
        },
      ],
    }

    const result = buildIdeogramJsonPrompt(value)

    expect(result.jsonPrompt.compositional_deconstruction.elements).toEqual([
      {
        type: 'obj',
        desc: 'Region shape hint: ellipse. Main product centered',
        bbox: [200, 300, 700, 800],
        color_palette: ['#FF3366', '#112233'],
      },
    ])
    expect(result.metadata.hiddenElementCount).toBe(1)
    expect(result.metadata.elementPaletteCount).toBe(2)
    expect(result.promptPreview).not.toContain('DRAFT')
    expect(result.magicPrompt).toContain('Main product centered')
  })

  it('migrates legacy color into palette', () => {
    const element = {
      id: 'el-1',
      type: 'obj' as const,
      desc: 'Bottle',
      color: '#ABCDEF',
    }

    expect(resolveElementPalette(element)).toEqual(['#ABCDEF'])
  })

  it('serializes photo style mode with style palette', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      background: 'City street',
      styleMode: 'photo' as const,
      styleDescription: {
        aesthetics: 'Cinematic',
        lighting: 'Golden hour',
        medium: 'Photograph',
        photo: '35mm film stock',
      },
      stylePalette: ['#111111', '#EEEEEE'],
      elements: [],
    }

    const result = buildIdeogramJsonPrompt(value)

    expect(result.jsonPrompt.style_description).toEqual({
      aesthetics: 'Cinematic',
      lighting: 'Golden hour',
      medium: 'Photograph',
      photo: '35mm film stock',
      color_palette: ['#111111', '#EEEEEE'],
    })
    expect(result.metadata.stylePaletteCount).toBe(2)
  })

  it('round-trips imported wire JSON with palettes', () => {
    const wire = {
      compositional_deconstruction: {
        background: 'White',
        elements: [
          {
            type: 'obj',
            desc: 'Product bottle centered',
            color_palette: ['#FF0000'],
          },
        ],
      },
    }

    const builder = ideogramV4JsonPromptToBuilderValue(wire)
    const rebuilt = buildIdeogramJsonPrompt(builder)

    expect(rebuilt.jsonPrompt.compositional_deconstruction.elements[0]).toMatchObject({
      type: 'obj',
      desc: 'Product bottle centered',
      color_palette: ['#FF0000'],
    })
  })

  it('parses stored builder JSON safely', () => {
    const parsed = parseIdeogramPromptBuilderValue({
      highLevelDescription: 'Test',
      background: 'Backdrop',
      resolution: '2560x1440',
      styleMode: 'art_style',
      elements: [{ id: 'a', type: 'obj', desc: 'Chair', palette: ['red'] }],
    })

    expect(parsed.highLevelDescription).toBe('Test')
    expect(parsed.resolution).toBe('2560x1440')
    expect(parsed.styleMode).toBe('art_style')
    expect(parsed.elements[0]?.palette).toEqual(['red'])
  })
})

describe('ideogram json helpers', () => {
  it('repairs trailing commas in pasted JSON', () => {
    const repaired = repairIdeogramJsonText(
      `{"compositional_deconstruction":{"background":"Sky","elements":[],},}`
    )
    expect(JSON.parse(repaired)).toEqual({
      compositional_deconstruction: { background: 'Sky', elements: [] },
    })
  })

  it('parses imported JSON text leniently', () => {
    const prompt = parseImportedIdeogramJsonText(
      "{'compositional_deconstruction':{'background':'Ocean','elements':[]}}"
    )
    expect(prompt.compositional_deconstruction.background).toBe('Ocean')
  })

  it('formats compact and pretty output', () => {
    const jsonPrompt = {
      compositional_deconstruction: { background: 'A', elements: [] },
    }
    expect(formatIdeogramJsonPrompt(jsonPrompt, 'compact')).not.toContain('\n')
    expect(formatIdeogramJsonPrompt(jsonPrompt, 'pretty')).toContain('\n')
  })

  it('estimates token count from serialized JSON', () => {
    const serialized = JSON.stringify({ background: 'test' })
    expect(estimateIdeogramTokenCount(serialized)).toBe(Math.ceil(serialized.length / 4))
  })

  it('normalizes palette entries', () => {
    expect(normalizeIdeogramPalette([' red ', '', 'blue'], 5)).toEqual(['red', 'blue'])
  })
})

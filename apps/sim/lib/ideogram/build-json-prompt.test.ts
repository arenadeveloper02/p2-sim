/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildIdeogramJsonPrompt,
  createDefaultIdeogramPromptBuilderValue,
  ideogramV4JsonPromptToBuilderValue,
  parseIdeogramPromptBuilderValue,
} from '@/lib/ideogram/build-json-prompt'

describe('buildIdeogramJsonPrompt', () => {
  it('serializes a minimal valid prompt', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      highLevelDescription: 'A cinematic product poster',
      background: 'Soft gradient studio backdrop',
      elements: [
        {
          id: 'el-1',
          type: 'text' as const,
          text: 'SUMMER SALE',
          desc: 'Bold headline across the top',
          bbox: [50, 100, 150, 900],
        },
      ],
    }

    const result = buildIdeogramJsonPrompt(value)

    expect(result.jsonPrompt.high_level_description).toBe('A cinematic product poster')
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
  })

  it('requires style trio when style description is provided', () => {
    const value = {
      ...createDefaultIdeogramPromptBuilderValue(),
      highLevelDescription: 'Poster',
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

  it('round-trips imported wire JSON', () => {
    const wire = {
      high_level_description: 'Layered ad',
      compositional_deconstruction: {
        background: 'White',
        elements: [{ type: 'obj', desc: 'Product bottle centered' }],
      },
    }

    const builder = ideogramV4JsonPromptToBuilderValue(wire)
    const rebuilt = buildIdeogramJsonPrompt(builder)

    expect(rebuilt.jsonPrompt).toMatchObject(wire)
  })

  it('parses stored builder JSON safely', () => {
    const parsed = parseIdeogramPromptBuilderValue({
      highLevelDescription: 'Test',
      background: 'Backdrop',
      resolution: '2560x1440',
      elements: [{ id: 'a', type: 'obj', desc: 'Chair' }],
    })

    expect(parsed.highLevelDescription).toBe('Test')
    expect(parsed.resolution).toBe('2560x1440')
    expect(parsed.elements[0]?.desc).toBe('Chair')
  })
})

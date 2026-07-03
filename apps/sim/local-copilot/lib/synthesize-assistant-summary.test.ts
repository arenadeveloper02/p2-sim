/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  stripLeakedToolMarkers,
  synthesizeAssistantSummaryFromTools,
} from '@/local-copilot/lib/synthesize-assistant-summary'

describe('stripLeakedToolMarkers', () => {
  it('removes legacy tool status markers', () => {
    expect(
      stripLeakedToolMarkers('[Tool generate_image: success] [Tool open_resource: success]')
    ).toBe('')
  })

  it('preserves boundary whitespace when trim is disabled for stream deltas', () => {
    expect(stripLeakedToolMarkers(' can ', { trim: false })).toBe(' can ')
    expect(stripLeakedToolMarkers('Now I ', { trim: false })).toBe('Now I ')
  })
})

describe('synthesizeAssistantSummaryFromTools', () => {
  it('summarizes multi-image generation', () => {
    const summary = synthesizeAssistantSummaryFromTools([
      {
        name: 'generate_image',
        success: true,
        result: {
          message: 'Generated 3 images: "files/a-1.png", "files/a-2.png", "files/a-3.png"',
          files: [{ vfsPath: 'files/a-1.png' }, { vfsPath: 'files/a-2.png' }],
        },
      },
      { name: 'open_resource', success: true, result: {} },
    ])

    expect(summary).toBe(
      'Generated 3 images: "files/a-1.png", "files/a-2.png", "files/a-3.png"'
    )
  })

  it('summarizes function_execute return values when stdout is empty', () => {
    const summary = synthesizeAssistantSummaryFromTools([
      {
        name: 'function_execute',
        success: true,
        result: { stdout: '', result: '1, 1, 2, 3, 5, 8' },
      },
    ])

    expect(summary).toBe('1, 1, 2, 3, 5, 8')
  })
})

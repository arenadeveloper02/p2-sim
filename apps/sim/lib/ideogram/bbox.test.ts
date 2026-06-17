/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clampIdeogramBbox,
  ideogramBboxToPixelRect,
  parseIdeogramBboxCoordinate,
  pixelRectToIdeogramBbox,
  snapIdeogramBbox,
  updateIdeogramBboxCoordinate,
} from '@/lib/ideogram/bbox'

describe('ideogram bbox helpers', () => {
  it('clamps coordinates to the 0-1000 grid', () => {
    expect(clampIdeogramBbox([-10, 0, 1200, 500])).toEqual([0, 0, 1000, 500])
  })

  it('maps pixel rects to normalized bbox and back', () => {
    const bbox = pixelRectToIdeogramBbox({ x: 100, y: 50, width: 200, height: 100 }, 400, 200)
    const rect = ideogramBboxToPixelRect(bbox, 400, 200)

    expect(bbox[0]).toBeGreaterThanOrEqual(0)
    expect(bbox[3]).toBeLessThanOrEqual(1000)
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
  })

  it('parses and updates bbox coordinates', () => {
    expect(parseIdeogramBboxCoordinate('250')).toBe(250)
    expect(updateIdeogramBboxCoordinate([10, 20, 300, 400], 2, '350')).toEqual([10, 20, 350, 400])
  })

  it('snaps bbox coordinates to grid steps', () => {
    expect(snapIdeogramBbox([12, 37, 488, 501], 50)).toEqual([0, 50, 500, 500])
  })
})

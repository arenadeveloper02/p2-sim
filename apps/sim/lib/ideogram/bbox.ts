import { IDEOGRAM_BBOX_GRID_SIZE } from '@/lib/ideogram/constants'
import type { IdeogramBbox } from '@/lib/ideogram/types'

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Clamp each bbox coordinate to the Ideogram 0–1000 grid. */
export function clampIdeogramBbox(bbox: IdeogramBbox): IdeogramBbox {
  const [yMin, xMin, yMax, xMax] = bbox
  const clampedYMin = clampInteger(yMin, 0, IDEOGRAM_BBOX_GRID_SIZE)
  const clampedXMin = clampInteger(xMin, 0, IDEOGRAM_BBOX_GRID_SIZE)
  const clampedYMax = clampInteger(yMax, 0, IDEOGRAM_BBOX_GRID_SIZE)
  const clampedXMax = clampInteger(xMax, 0, IDEOGRAM_BBOX_GRID_SIZE)

  if (clampedYMax <= clampedYMin || clampedXMax <= clampedXMin) {
    return [clampedYMin, clampedXMin, clampedYMin + 1, clampedXMin + 1]
  }

  return [clampedYMin, clampedXMin, clampedYMax, clampedXMax]
}

/**
 * Convert pixel coordinates on a display canvas to Ideogram's normalized bbox.
 * Display canvas uses the output resolution aspect ratio; serialization always maps to 1000×1000.
 */
export function pixelRectToIdeogramBbox(
  rect: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): IdeogramBbox {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return [0, 0, 1, 1]
  }

  const xMin = (rect.x / canvasWidth) * IDEOGRAM_BBOX_GRID_SIZE
  const yMin = (rect.y / canvasHeight) * IDEOGRAM_BBOX_GRID_SIZE
  const xMax = ((rect.x + rect.width) / canvasWidth) * IDEOGRAM_BBOX_GRID_SIZE
  const yMax = ((rect.y + rect.height) / canvasHeight) * IDEOGRAM_BBOX_GRID_SIZE

  return clampIdeogramBbox([yMin, xMin, yMax, xMax])
}

/** Convert a normalized bbox back to pixel coordinates for canvas rendering. */
export function ideogramBboxToPixelRect(
  bbox: IdeogramBbox,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  const [yMin, xMin, yMax, xMax] = clampIdeogramBbox(bbox)
  const x = (xMin / IDEOGRAM_BBOX_GRID_SIZE) * canvasWidth
  const y = (yMin / IDEOGRAM_BBOX_GRID_SIZE) * canvasHeight
  const width = ((xMax - xMin) / IDEOGRAM_BBOX_GRID_SIZE) * canvasWidth
  const height = ((yMax - yMin) / IDEOGRAM_BBOX_GRID_SIZE) * canvasHeight

  return { x, y, width, height }
}

/** Ideogram v4 generate API resolution enum (2K-class). */
export const IDEOGRAM_V4_RESOLUTIONS = [
  '2048x2048',
  '1440x2880',
  '2880x1440',
  '1664x2496',
  '2496x1664',
  '1792x2240',
  '2240x1792',
  '1440x2560',
  '2560x1440',
  '1600x2560',
  '2560x1600',
  '1728x2304',
  '2304x1728',
  '1296x3168',
  '3168x1296',
  '1152x2944',
  '2944x1152',
  '1248x3328',
  '3328x1248',
  '1280x3072',
  '3072x1280',
  '1024x3072',
  '3072x1024',
] as const

export type IdeogramV4Resolution = (typeof IDEOGRAM_V4_RESOLUTIONS)[number]

/** Rendering speeds exposed by the Ideogram v4 API. */
export const IDEOGRAM_RENDERING_SPEEDS = ['FLASH', 'TURBO', 'DEFAULT', 'QUALITY'] as const

export type IdeogramRenderingSpeed = (typeof IDEOGRAM_RENDERING_SPEEDS)[number]

export const IDEOGRAM_V4_MODEL = 'ideogram-v4'

export const IDEOGRAM_BBOX_GRID_SIZE = 1000

export const IDEOGRAM_DEFAULT_RESOLUTION: IdeogramV4Resolution = '2048x2048'

export const IDEOGRAM_DEFAULT_RENDERING_SPEED: IdeogramRenderingSpeed = 'DEFAULT'

/** Maximum palette colors per compositional element (KJ / Ideogram 4 builder parity). */
export const IDEOGRAM_MAX_ELEMENT_PALETTE_COLORS = 5

/** Maximum palette colors on global style description. */
export const IDEOGRAM_MAX_STYLE_PALETTE_COLORS = 16

/** Approximate json_prompt token budget before Ideogram may truncate. */
export const IDEOGRAM_TOKEN_ESTIMATE_LIMIT = 2048

export const IDEOGRAM_STYLE_MODES = ['none', 'photo', 'art_style'] as const

export type IdeogramStyleMode = (typeof IDEOGRAM_STYLE_MODES)[number]

export const IDEOGRAM_OUTPUT_FORMATS = ['compact', 'pretty'] as const

export type IdeogramOutputFormat = (typeof IDEOGRAM_OUTPUT_FORMATS)[number]

export const IDEOGRAM_CANVAS_GUIDES = ['thirds', 'grid', 'golden', 'spiral'] as const

export type IdeogramCanvasGuide = (typeof IDEOGRAM_CANVAS_GUIDES)[number]

/** Parse `WIDTHxHEIGHT` into numeric dimensions. */
export function parseIdeogramResolution(resolution: string): { width: number; height: number } {
  const [widthText, heightText] = resolution.split('x')
  const width = Number(widthText)
  const height = Number(heightText)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 }
  }
  return { width, height }
}

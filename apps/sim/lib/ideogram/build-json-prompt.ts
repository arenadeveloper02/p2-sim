import { generateId } from '@sim/utils/id'
import { clampIdeogramBbox } from '@/lib/ideogram/bbox'
import {
  IDEOGRAM_DEFAULT_RESOLUTION,
  IDEOGRAM_DEFAULT_RENDERING_SPEED,
  IDEOGRAM_MAX_ELEMENT_PALETTE_COLORS,
  IDEOGRAM_MAX_STYLE_PALETTE_COLORS,
  IDEOGRAM_TOKEN_ESTIMATE_LIMIT,
  type IdeogramOutputFormat,
} from '@/lib/ideogram/constants'
import type {
  IdeogramBuilderElement,
  IdeogramPromptBuildMetadata,
  IdeogramPromptBuilderValue,
  IdeogramV4Element,
  IdeogramV4JsonPrompt,
  IdeogramV4ObjElement,
  IdeogramV4TextElement,
} from '@/lib/ideogram/types'
import { validateIdeogramPromptBuilderValue, validateIdeogramV4JsonPrompt } from '@/lib/ideogram/validation'

export function createDefaultIdeogramPromptBuilderValue(): IdeogramPromptBuilderValue {
  return {
    highLevelDescription: '',
    background: '',
    styleMode: 'none',
    elements: [],
    resolution: IDEOGRAM_DEFAULT_RESOLUTION,
    renderingSpeed: IDEOGRAM_DEFAULT_RENDERING_SPEED,
    outputFormat: 'pretty',
    magicPromptEnabled: false,
    referenceImageOpacity: 0.35,
    canvasSettings: {
      showGuides: false,
      guideMode: 'thirds',
      snapToGrid: false,
      hideBoxes: false,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Normalize and trim palette entries; drops blanks and enforces max length. */
export function normalizeIdeogramPalette(
  palette: string[] | undefined,
  maxColors: number
): string[] | undefined {
  if (!palette || palette.length === 0) return undefined

  const normalized = palette
    .map((color) => color.trim())
    .filter((color) => color.length > 0)
    .slice(0, maxColors)

  return normalized.length > 0 ? normalized : undefined
}

/** Merge legacy single `color` into palette when palette is absent. */
export function resolveElementPalette(element: IdeogramBuilderElement): string[] | undefined {
  const palette = normalizeIdeogramPalette(element.palette, IDEOGRAM_MAX_ELEMENT_PALETTE_COLORS)
  if (palette) return palette

  const legacyColor = element.color?.trim()
  return legacyColor ? [legacyColor] : undefined
}

/** Rough token estimate for json_prompt serialization (chars / 4). */
export function estimateIdeogramTokenCount(serialized: string): number {
  return Math.ceil(serialized.length / 4)
}

/** Format json_prompt for preview/export. */
export function formatIdeogramJsonPrompt(
  jsonPrompt: IdeogramV4JsonPrompt,
  format: IdeogramOutputFormat = 'pretty'
): string {
  return format === 'compact' ? JSON.stringify(jsonPrompt) : JSON.stringify(jsonPrompt, null, 2)
}

/**
 * Leniently repair common JSON issues from pasted Ideogram captions.
 * Returns repaired JSON text or throws when parsing is impossible.
 */
export function repairIdeogramJsonText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('JSON input is empty')
  }

  try {
    JSON.parse(trimmed)
    return trimmed
  } catch {}

  let repaired = trimmed
  repaired = repaired.replace(/^\uFEFF/, '')
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')
  repaired = repaired.replace(/'/g, '"')

  const firstBrace = repaired.indexOf('{')
  const lastBrace = repaired.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    repaired = repaired.slice(firstBrace, lastBrace + 1)
  }

  try {
    JSON.parse(repaired)
    return repaired
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Could not parse Ideogram JSON after repair'
    )
  }
}

/** Parse imported JSON text into a wire prompt with lenient repair. */
export function parseImportedIdeogramJsonText(raw: string): IdeogramV4JsonPrompt {
  const repaired = repairIdeogramJsonText(raw)
  const parsed = JSON.parse(repaired) as unknown
  if (!isRecord(parsed)) {
    throw new Error('Ideogram JSON must be an object')
  }
  return parsed as IdeogramV4JsonPrompt
}

function parseWirePalette(value: unknown, maxColors: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const colors = value.filter((item): item is string => typeof item === 'string')
  return normalizeIdeogramPalette(colors, maxColors)
}

function toBuilderElement(raw: Record<string, unknown>, fallbackId?: string): IdeogramBuilderElement | null {
  const type = raw.type
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : fallbackId ?? generateId()
  const bbox =
    Array.isArray(raw.bbox) && raw.bbox.length === 4
      ? clampIdeogramBbox(raw.bbox as [number, number, number, number])
      : undefined
  const palette =
    parseWirePalette(raw.palette, IDEOGRAM_MAX_ELEMENT_PALETTE_COLORS) ??
    parseWirePalette(raw.color_palette, IDEOGRAM_MAX_ELEMENT_PALETTE_COLORS)
  const color = typeof raw.color === 'string' && !palette ? raw.color : undefined
  const hidden = raw.hidden === true
  const locked = raw.locked === true
  const shape =
    raw.shape === 'ellipse' || raw.shape === 'freehand' || raw.shape === 'line'
      ? raw.shape
      : 'rectangle'

  if (type === 'obj' && typeof raw.desc === 'string') {
    return { id, type: 'obj', desc: raw.desc, bbox, palette, color, hidden, locked, shape }
  }

  if (type === 'text' && typeof raw.text === 'string' && typeof raw.desc === 'string') {
    return { id, type: 'text', text: raw.text, desc: raw.desc, bbox, palette, color, hidden, locked, shape }
  }

  return null
}

function inferStyleModeFromWire(
  style: IdeogramV4JsonPrompt['style_description']
): IdeogramPromptBuilderValue['styleMode'] {
  if (!style) return 'none'
  if (style.art_style?.trim()) return 'art_style'
  if (style.photo?.trim()) return 'photo'
  return 'none'
}

/** Parse stored subblock JSON into a normalized builder value. */
export function parseIdeogramPromptBuilderValue(value: unknown): IdeogramPromptBuilderValue {
  if (!isRecord(value)) {
    return createDefaultIdeogramPromptBuilderValue()
  }

  const elementsRaw = Array.isArray(value.elements) ? value.elements : []
  const elements = elementsRaw
    .map((element) => (isRecord(element) ? toBuilderElement(element) : null))
    .filter((element): element is IdeogramBuilderElement => element !== null)

  const styleRaw = isRecord(value.styleDescription) ? value.styleDescription : undefined
  const styleDescription =
    styleRaw &&
    typeof styleRaw.aesthetics === 'string' &&
    typeof styleRaw.lighting === 'string' &&
    typeof styleRaw.medium === 'string'
      ? {
          aesthetics: styleRaw.aesthetics,
          lighting: styleRaw.lighting,
          medium: styleRaw.medium,
          ...(typeof styleRaw.artStyle === 'string' ? { artStyle: styleRaw.artStyle } : {}),
          ...(typeof styleRaw.photo === 'string' ? { photo: styleRaw.photo } : {}),
        }
      : undefined

  const canvasRaw = isRecord(value.canvasSettings) ? value.canvasSettings : undefined

  return {
    highLevelDescription:
      typeof value.highLevelDescription === 'string' ? value.highLevelDescription : '',
    background: typeof value.background === 'string' ? value.background : '',
    styleMode:
      value.styleMode === 'photo' || value.styleMode === 'art_style' || value.styleMode === 'none'
        ? value.styleMode
        : 'none',
    styleDescription,
    stylePalette: parseWirePalette(value.stylePalette, IDEOGRAM_MAX_STYLE_PALETTE_COLORS),
    elements,
    resolution:
      typeof value.resolution === 'string' && value.resolution.length > 0
        ? (value.resolution as IdeogramPromptBuilderValue['resolution'])
        : IDEOGRAM_DEFAULT_RESOLUTION,
    renderingSpeed:
      typeof value.renderingSpeed === 'string'
        ? (value.renderingSpeed as IdeogramPromptBuilderValue['renderingSpeed'])
        : IDEOGRAM_DEFAULT_RENDERING_SPEED,
    outputFormat: value.outputFormat === 'compact' ? 'compact' : 'pretty',
    magicPromptEnabled: value.magicPromptEnabled === true,
    referenceImageUrl:
      typeof value.referenceImageUrl === 'string' ? value.referenceImageUrl : undefined,
    referenceImageOpacity:
      typeof value.referenceImageOpacity === 'number' ? value.referenceImageOpacity : 0.35,
    canvasSettings: canvasRaw
      ? {
          showGuides: canvasRaw.showGuides === true,
          guideMode:
            canvasRaw.guideMode === 'grid' ||
            canvasRaw.guideMode === 'golden' ||
            canvasRaw.guideMode === 'spiral'
              ? canvasRaw.guideMode
              : 'thirds',
          snapToGrid: canvasRaw.snapToGrid === true,
          hideBoxes: canvasRaw.hideBoxes === true,
        }
      : createDefaultIdeogramPromptBuilderValue().canvasSettings,
  }
}

function toWireElement(element: IdeogramBuilderElement): IdeogramV4Element {
  const bbox = element.bbox ? clampIdeogramBbox(element.bbox) : undefined
  const shapePrefix =
    element.shape && element.shape !== 'rectangle' ? `Region shape hint: ${element.shape}. ` : ''
  const desc = `${shapePrefix}${element.desc.trim()}`
  const colorPalette = resolveElementPalette(element)

  if (element.type === 'obj') {
    const wire: IdeogramV4ObjElement = { type: 'obj', desc }
    if (bbox) wire.bbox = bbox
    if (colorPalette) wire.color_palette = colorPalette
    return wire
  }

  const wire: IdeogramV4TextElement = {
    type: 'text',
    text: element.text.trim(),
    desc,
  }
  if (bbox) wire.bbox = bbox
  if (colorPalette) wire.color_palette = colorPalette
  return wire
}

function shouldEmitStyleDescription(value: IdeogramPromptBuilderValue): boolean {
  const style = value.styleDescription
  if (!style) return false

  const mode = value.styleMode ?? 'none'
  if (mode === 'photo' || mode === 'art_style') {
    return true
  }

  return Boolean(
    style.aesthetics.trim() ||
      style.lighting.trim() ||
      style.medium.trim() ||
      style.artStyle?.trim() ||
      style.photo?.trim() ||
      value.stylePalette?.length
  )
}

/** Build a human-readable preview string from builder state. */
export function buildIdeogramPromptPreview(value: IdeogramPromptBuilderValue): string {
  const lines: string[] = []
  const highLevel = value.highLevelDescription.trim()
  if (highLevel) lines.push(highLevel)

  if (value.styleDescription) {
    lines.push(
      `Style: ${value.styleDescription.aesthetics}; ${value.styleDescription.lighting}; ${value.styleDescription.medium}`
    )
  }
  lines.push(`Background: ${value.background.trim()}`)
  value.elements
    .filter((element) => !element.hidden)
    .forEach((element, index) => {
      if (element.type === 'text') {
        lines.push(`Text ${index + 1}: "${element.text.trim()}" — ${element.desc.trim()}`)
      } else {
        lines.push(`Object ${index + 1}: ${element.desc.trim()}`)
      }
    })
  return lines.filter((line) => line.length > 0).join('\n')
}

/** Build the plain text prompt used with Ideogram's text_prompt Magic Prompt path. */
export function buildIdeogramMagicPrompt(value: IdeogramPromptBuilderValue): string {
  return buildIdeogramPromptPreview(value)
}

export interface BuildIdeogramJsonPromptResult {
  jsonPrompt: IdeogramV4JsonPrompt
  serializedJsonPrompt: string
  promptPreview: string
  magicPrompt: string
  elements: IdeogramV4Element[]
  metadata: IdeogramPromptBuildMetadata
}

/**
 * Serialize builder state into Ideogram v4 `json_prompt` wire format.
 * Throws when validation fails.
 */
export function buildIdeogramJsonPrompt(value: IdeogramPromptBuilderValue): BuildIdeogramJsonPromptResult {
  const errors = validateIdeogramPromptBuilderValue(value)
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }

  const visibleElements = value.elements.filter((element) => !element.hidden)
  const elements = visibleElements.map(toWireElement)
  const trimmedHighLevel = value.highLevelDescription.trim()

  const jsonPrompt: IdeogramV4JsonPrompt = {
    compositional_deconstruction: {
      background: value.background.trim(),
      elements,
    },
  }

  if (trimmedHighLevel) {
    jsonPrompt.high_level_description = trimmedHighLevel
  }

  if (shouldEmitStyleDescription(value) && value.styleDescription) {
    const style = value.styleDescription
    const stylePalette = normalizeIdeogramPalette(
      value.stylePalette,
      IDEOGRAM_MAX_STYLE_PALETTE_COLORS
    )

    jsonPrompt.style_description = {
      aesthetics: style.aesthetics.trim(),
      lighting: style.lighting.trim(),
      medium: style.medium.trim(),
      ...(style.artStyle?.trim() ? { art_style: style.artStyle.trim() } : {}),
      ...(style.photo?.trim() ? { photo: style.photo.trim() } : {}),
      ...(stylePalette ? { color_palette: stylePalette } : {}),
    }
  }

  const wireErrors = validateIdeogramV4JsonPrompt(jsonPrompt)
  if (wireErrors.length > 0) {
    throw new Error(wireErrors.join('; '))
  }

  const outputFormat = value.outputFormat ?? 'pretty'
  const serializedJsonPrompt = formatIdeogramJsonPrompt(jsonPrompt, outputFormat)
  const tokenEstimate = estimateIdeogramTokenCount(serializedJsonPrompt)

  const elementPaletteCount = visibleElements.reduce((count, element) => {
    const palette = resolveElementPalette(element)
    return count + (palette?.length ?? 0)
  }, 0)

  const metadata: IdeogramPromptBuildMetadata = {
    elementCount: elements.length,
    resolution: value.resolution,
    renderingSpeed: value.renderingSpeed,
    hasStyleDescription: Boolean(jsonPrompt.style_description),
    bboxElementCount: elements.filter((element) => element.bbox).length,
    hiddenElementCount: value.elements.length - visibleElements.length,
    magicPromptEnabled: value.magicPromptEnabled === true,
    tokenEstimate,
    tokenEstimateOverLimit: tokenEstimate > IDEOGRAM_TOKEN_ESTIMATE_LIMIT,
    stylePaletteCount: value.stylePalette?.length ?? 0,
    elementPaletteCount,
  }

  return {
    jsonPrompt,
    serializedJsonPrompt,
    promptPreview: buildIdeogramPromptPreview(value),
    magicPrompt: buildIdeogramMagicPrompt(value),
    elements,
    metadata,
  }
}

function wireElementToBuilder(element: IdeogramV4Element): IdeogramBuilderElement {
  const id = generateId()
  const bbox = element.bbox ? clampIdeogramBbox(element.bbox) : undefined
  const palette = parseWirePalette(element.color_palette, IDEOGRAM_MAX_ELEMENT_PALETTE_COLORS)
  const desc = element.desc

  if (element.type === 'text') {
    return { id, type: 'text', text: element.text, desc, bbox, palette, shape: 'rectangle' }
  }

  return { id, type: 'obj', desc, bbox, palette, shape: 'rectangle' }
}

/** Parse imported wire JSON into builder state (round-trip helper). */
export function ideogramV4JsonPromptToBuilderValue(
  prompt: IdeogramV4JsonPrompt,
  resolution: IdeogramPromptBuilderValue['resolution'] = IDEOGRAM_DEFAULT_RESOLUTION
): IdeogramPromptBuilderValue {
  const wireErrors = validateIdeogramV4JsonPrompt(prompt)
  if (wireErrors.length > 0) {
    throw new Error(wireErrors.join('; '))
  }

  const style = prompt.style_description
  const elements = prompt.compositional_deconstruction.elements.map(wireElementToBuilder)

  return {
    highLevelDescription: prompt.high_level_description ?? '',
    background: prompt.compositional_deconstruction.background,
    styleMode: inferStyleModeFromWire(style),
    styleDescription: style
      ? {
          aesthetics: style.aesthetics,
          lighting: style.lighting,
          medium: style.medium,
          ...(style.art_style ? { artStyle: style.art_style } : {}),
          ...(style.photo ? { photo: style.photo } : {}),
        }
      : undefined,
    stylePalette: parseWirePalette(style?.color_palette, IDEOGRAM_MAX_STYLE_PALETTE_COLORS),
    elements,
    resolution,
    renderingSpeed: IDEOGRAM_DEFAULT_RENDERING_SPEED,
    outputFormat: 'pretty',
    magicPromptEnabled: false,
    referenceImageOpacity: 0.35,
    canvasSettings: createDefaultIdeogramPromptBuilderValue().canvasSettings,
  }
}

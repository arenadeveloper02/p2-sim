import { generateId } from '@sim/utils/id'
import { clampIdeogramBbox } from '@/lib/ideogram/bbox'
import {
  IDEOGRAM_DEFAULT_RESOLUTION,
  IDEOGRAM_DEFAULT_RENDERING_SPEED,
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
    elements: [],
    resolution: IDEOGRAM_DEFAULT_RESOLUTION,
    renderingSpeed: IDEOGRAM_DEFAULT_RENDERING_SPEED,
    magicPromptEnabled: false,
    referenceImageOpacity: 0.35,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBuilderElement(raw: Record<string, unknown>, fallbackId?: string): IdeogramBuilderElement | null {
  const type = raw.type
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : fallbackId ?? generateId()
  const bbox =
    Array.isArray(raw.bbox) && raw.bbox.length === 4
      ? clampIdeogramBbox(raw.bbox as [number, number, number, number])
      : undefined
  const color = typeof raw.color === 'string' ? raw.color : undefined
  const hidden = raw.hidden === true
  const shape =
    raw.shape === 'ellipse' || raw.shape === 'freehand' || raw.shape === 'line'
      ? raw.shape
      : 'rectangle'

  if (type === 'obj' && typeof raw.desc === 'string') {
    return { id, type: 'obj', desc: raw.desc, bbox, color, hidden, shape }
  }

  if (type === 'text' && typeof raw.text === 'string' && typeof raw.desc === 'string') {
    return { id, type: 'text', text: raw.text, desc: raw.desc, bbox, color, hidden, shape }
  }

  return null
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

  return {
    highLevelDescription:
      typeof value.highLevelDescription === 'string' ? value.highLevelDescription : '',
    background: typeof value.background === 'string' ? value.background : '',
    styleDescription,
    elements,
    resolution:
      typeof value.resolution === 'string' && value.resolution.length > 0
        ? (value.resolution as IdeogramPromptBuilderValue['resolution'])
        : IDEOGRAM_DEFAULT_RESOLUTION,
    renderingSpeed:
      typeof value.renderingSpeed === 'string'
        ? (value.renderingSpeed as IdeogramPromptBuilderValue['renderingSpeed'])
        : IDEOGRAM_DEFAULT_RENDERING_SPEED,
    magicPromptEnabled: value.magicPromptEnabled === true,
    referenceImageUrl:
      typeof value.referenceImageUrl === 'string' ? value.referenceImageUrl : undefined,
    referenceImageOpacity:
      typeof value.referenceImageOpacity === 'number' ? value.referenceImageOpacity : 0.35,
  }
}

function toWireElement(element: IdeogramBuilderElement): IdeogramV4Element {
  const bbox = element.bbox ? clampIdeogramBbox(element.bbox) : undefined
  const colorPrefix = element.color?.trim() ? `Color guidance: ${element.color.trim()}. ` : ''
  const shapePrefix =
    element.shape && element.shape !== 'rectangle' ? `Region shape hint: ${element.shape}. ` : ''
  const desc = `${shapePrefix}${colorPrefix}${element.desc.trim()}`

  if (element.type === 'obj') {
    const wire: IdeogramV4ObjElement = { type: 'obj', desc }
    if (bbox) wire.bbox = bbox
    return wire
  }

  const wire: IdeogramV4TextElement = {
    type: 'text',
    text: element.text.trim(),
    desc,
  }
  if (bbox) wire.bbox = bbox
  return wire
}

/** Build a human-readable preview string from builder state. */
export function buildIdeogramPromptPreview(value: IdeogramPromptBuilderValue): string {
  const lines = [value.highLevelDescription.trim()]
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
  const jsonPrompt: IdeogramV4JsonPrompt = {
    high_level_description: value.highLevelDescription.trim(),
    compositional_deconstruction: {
      background: value.background.trim(),
      elements,
    },
  }

  if (value.styleDescription) {
    const style = value.styleDescription
    const hasStyle =
      style.aesthetics.trim() ||
      style.lighting.trim() ||
      style.medium.trim() ||
      style.artStyle?.trim() ||
      style.photo?.trim()

    if (hasStyle) {
      jsonPrompt.style_description = {
        aesthetics: style.aesthetics.trim(),
        lighting: style.lighting.trim(),
        medium: style.medium.trim(),
        ...(style.artStyle?.trim() ? { art_style: style.artStyle.trim() } : {}),
        ...(style.photo?.trim() ? { photo: style.photo.trim() } : {}),
      }
    }
  }

  const wireErrors = validateIdeogramV4JsonPrompt(jsonPrompt)
  if (wireErrors.length > 0) {
    throw new Error(wireErrors.join('; '))
  }

  const metadata: IdeogramPromptBuildMetadata = {
    elementCount: elements.length,
    resolution: value.resolution,
    renderingSpeed: value.renderingSpeed,
    hasStyleDescription: Boolean(jsonPrompt.style_description),
    bboxElementCount: elements.filter((element) => element.bbox).length,
    hiddenElementCount: value.elements.length - visibleElements.length,
    magicPromptEnabled: value.magicPromptEnabled === true,
  }

  return {
    jsonPrompt,
    promptPreview: buildIdeogramPromptPreview(value),
    magicPrompt: buildIdeogramMagicPrompt(value),
    elements,
    metadata,
  }
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
  const elements = prompt.compositional_deconstruction.elements.map((element) => {
    const id = generateId()
    const bbox = element.bbox ? clampIdeogramBbox(element.bbox) : undefined
    if (element.type === 'text') {
      return { id, type: 'text' as const, text: element.text, desc: element.desc, bbox }
    }
    return { id, type: 'obj' as const, desc: element.desc, bbox }
  })

  return {
    highLevelDescription: prompt.high_level_description,
    background: prompt.compositional_deconstruction.background,
    styleDescription: style
      ? {
          aesthetics: style.aesthetics,
          lighting: style.lighting,
          medium: style.medium,
          ...(style.art_style ? { artStyle: style.art_style } : {}),
          ...(style.photo ? { photo: style.photo } : {}),
        }
      : undefined,
    elements,
    resolution,
    renderingSpeed: IDEOGRAM_DEFAULT_RENDERING_SPEED,
    magicPromptEnabled: false,
    referenceImageOpacity: 0.35,
  }
}

import {
  IDEOGRAM_RENDERING_SPEEDS,
  IDEOGRAM_V4_RESOLUTIONS,
  type IdeogramRenderingSpeed,
  type IdeogramV4Resolution,
} from '@/lib/ideogram/constants'
import type {
  IdeogramBuilderElement,
  IdeogramPromptBuilderStyleDescription,
  IdeogramPromptBuilderValue,
  IdeogramV4Element,
  IdeogramV4JsonPrompt,
} from '@/lib/ideogram/types'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIdeogramBbox(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 4) return false
  return value.every((coordinate) => Number.isInteger(coordinate))
}

export function isIdeogramV4Resolution(value: string): value is IdeogramV4Resolution {
  return (IDEOGRAM_V4_RESOLUTIONS as readonly string[]).includes(value)
}

export function isIdeogramRenderingSpeed(value: string): value is IdeogramRenderingSpeed {
  return (IDEOGRAM_RENDERING_SPEEDS as readonly string[]).includes(value)
}

function validateStyleDescription(
  style: IdeogramPromptBuilderStyleDescription | undefined,
  pathPrefix: string
): string[] {
  if (!style) return []

  const errors: string[] = []
  const hasAnyField =
    isNonEmptyString(style.aesthetics) ||
    isNonEmptyString(style.lighting) ||
    isNonEmptyString(style.medium) ||
    isNonEmptyString(style.artStyle) ||
    isNonEmptyString(style.photo)

  if (!hasAnyField) return []

  if (!isNonEmptyString(style.aesthetics)) {
    errors.push(`${pathPrefix}.aesthetics is required when style description is provided`)
  }
  if (!isNonEmptyString(style.lighting)) {
    errors.push(`${pathPrefix}.lighting is required when style description is provided`)
  }
  if (!isNonEmptyString(style.medium)) {
    errors.push(`${pathPrefix}.medium is required when style description is provided`)
  }

  return errors
}

function validateBuilderElement(element: IdeogramBuilderElement, index: number): string[] {
  const errors: string[] = []
  const prefix = `elements[${index}]`

  if (element.bbox && !isIdeogramBbox(element.bbox)) {
    errors.push(`${prefix}.bbox must be four integers [y_min, x_min, y_max, x_max]`)
  }

  if (element.type === 'obj') {
    if (!isNonEmptyString(element.desc)) {
      errors.push(`${prefix}.desc is required for object elements`)
    }
    return errors
  }

  if (!isNonEmptyString(element.text)) {
    errors.push(`${prefix}.text is required for text elements`)
  }
  if (!isNonEmptyString(element.desc)) {
    errors.push(`${prefix}.desc is required for text elements`)
  }

  return errors
}

/** Validate builder state before serialization or execution. */
export function validateIdeogramPromptBuilderValue(value: IdeogramPromptBuilderValue): string[] {
  const errors: string[] = []

  if (!isNonEmptyString(value.highLevelDescription)) {
    errors.push('highLevelDescription is required')
  }
  if (!isNonEmptyString(value.background)) {
    errors.push('background is required')
  }
  if (!isIdeogramV4Resolution(value.resolution)) {
    errors.push(`resolution must be one of: ${IDEOGRAM_V4_RESOLUTIONS.join(', ')}`)
  }
  if (value.renderingSpeed && !isIdeogramRenderingSpeed(value.renderingSpeed)) {
    errors.push(`renderingSpeed must be one of: ${IDEOGRAM_RENDERING_SPEEDS.join(', ')}`)
  }

  errors.push(...validateStyleDescription(value.styleDescription, 'styleDescription'))
  value.elements.forEach((element, index) => {
    errors.push(...validateBuilderElement(element, index))
  })

  return errors
}

function validateWireElement(element: IdeogramV4Element, index: number): string[] {
  const errors: string[] = []
  const prefix = `elements[${index}]`

  if (element.bbox && !isIdeogramBbox(element.bbox)) {
    errors.push(`${prefix}.bbox must be four integers`)
  }

  if (element.type === 'obj') {
    if (!isNonEmptyString(element.desc)) {
      errors.push(`${prefix}.desc is required for object elements`)
    }
    return errors
  }

  if (!isNonEmptyString(element.text)) {
    errors.push(`${prefix}.text is required for text elements`)
  }
  if (!isNonEmptyString(element.desc)) {
    errors.push(`${prefix}.desc is required for text elements`)
  }

  return errors
}

/** Validate a wire-format `V4JsonPrompt` object. */
export function validateIdeogramV4JsonPrompt(prompt: IdeogramV4JsonPrompt): string[] {
  const errors: string[] = []

  if (!isNonEmptyString(prompt.high_level_description)) {
    errors.push('high_level_description is required')
  }

  const style = prompt.style_description
  if (style) {
    if (!isNonEmptyString(style.aesthetics)) {
      errors.push('style_description.aesthetics is required when style_description is present')
    }
    if (!isNonEmptyString(style.lighting)) {
      errors.push('style_description.lighting is required when style_description is present')
    }
    if (!isNonEmptyString(style.medium)) {
      errors.push('style_description.medium is required when style_description is present')
    }
  }

  if (!isNonEmptyString(prompt.compositional_deconstruction?.background)) {
    errors.push('compositional_deconstruction.background is required')
  }

  const elements = prompt.compositional_deconstruction?.elements
  if (!Array.isArray(elements)) {
    errors.push('compositional_deconstruction.elements must be an array')
    return errors
  }

  elements.forEach((element, index) => {
    errors.push(...validateWireElement(element, index))
  })

  return errors
}

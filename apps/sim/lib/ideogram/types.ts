import type {
  IdeogramCanvasGuide,
  IdeogramOutputFormat,
  IdeogramRenderingSpeed,
  IdeogramStyleMode,
  IdeogramV4Resolution,
} from '@/lib/ideogram/constants'

/** Normalized bbox on Ideogram's 1000×1000 logical canvas: [y_min, x_min, y_max, x_max]. */
export type IdeogramBbox = [number, number, number, number]

/** Wire-format object element for Ideogram v4 `json_prompt`. */
export interface IdeogramV4ObjElement {
  type: 'obj'
  desc: string
  bbox?: IdeogramBbox
  color_palette?: string[]
}

/** Wire-format text element for Ideogram v4 `json_prompt`. */
export interface IdeogramV4TextElement {
  type: 'text'
  text: string
  desc: string
  bbox?: IdeogramBbox
  color_palette?: string[]
}

export type IdeogramV4Element = IdeogramV4ObjElement | IdeogramV4TextElement

export interface IdeogramV4StyleDescription {
  aesthetics: string
  lighting: string
  medium: string
  art_style?: string
  photo?: string
  color_palette?: string[]
}

/** Ideogram v4 `V4JsonPrompt` wire shape. */
export interface IdeogramV4JsonPrompt {
  high_level_description?: string
  style_description?: IdeogramV4StyleDescription
  compositional_deconstruction: {
    background: string
    elements: IdeogramV4Element[]
  }
}

/** UI-only element id for list management; stripped during serialization. */
export interface IdeogramBuilderElementBase {
  id: string
  bbox?: IdeogramBbox
  /** @deprecated Legacy single-color guidance; migrated to `palette` on parse. */
  color?: string
  palette?: string[]
  hidden?: boolean
  locked?: boolean
  shape?: 'rectangle' | 'ellipse' | 'freehand' | 'line'
}

export interface IdeogramBuilderObjElement extends IdeogramBuilderElementBase {
  type: 'obj'
  desc: string
}

export interface IdeogramBuilderTextElement extends IdeogramBuilderElementBase {
  type: 'text'
  text: string
  desc: string
}

export type IdeogramBuilderElement = IdeogramBuilderObjElement | IdeogramBuilderTextElement

export interface IdeogramPromptBuilderStyleDescription {
  aesthetics: string
  lighting: string
  medium: string
  artStyle?: string
  photo?: string
}

export interface IdeogramCanvasSettings {
  showGuides?: boolean
  guideMode?: IdeogramCanvasGuide
  snapToGrid?: boolean
  hideBoxes?: boolean
}

/** JSON-serializable builder state stored in workflow subblocks. */
export interface IdeogramPromptBuilderValue {
  highLevelDescription: string
  background: string
  styleMode?: IdeogramStyleMode
  styleDescription?: IdeogramPromptBuilderStyleDescription
  stylePalette?: string[]
  elements: IdeogramBuilderElement[]
  resolution: IdeogramV4Resolution
  renderingSpeed?: IdeogramRenderingSpeed
  outputFormat?: IdeogramOutputFormat
  magicPromptEnabled?: boolean
  referenceImageUrl?: string
  referenceImageOpacity?: number
  canvasSettings?: IdeogramCanvasSettings
}

export interface IdeogramPromptBuildMetadata {
  elementCount: number
  resolution: IdeogramV4Resolution
  renderingSpeed?: IdeogramRenderingSpeed
  hasStyleDescription: boolean
  bboxElementCount: number
  hiddenElementCount: number
  magicPromptEnabled: boolean
  tokenEstimate: number
  tokenEstimateOverLimit: boolean
  stylePaletteCount: number
  elementPaletteCount: number
}

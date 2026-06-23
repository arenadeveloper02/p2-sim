/* ============================================================
   PRESENTATION CONTENT SCHEMA
   ============================================================ */

/* ---------- Block Types ---------- */

export type BlockType = 'TEXT' | 'IMAGE'

/* ---------- Base Block ---------- */

export interface BaseBlock {
  key: string // Semantic identifier (stable across versions)
  type: BlockType
  description: string // Used by LLM to generate content
  shapeId: string // TEMPLATE shapeId (never runtime slide ID)
  content: string | string[] // Filled by LLM ("" initially)
}

/* ---------- Text Blocks ---------- */

export interface TextBlock extends BaseBlock {
  type: 'TEXT'
  role: 'TITLE' | 'SECTION_HEADER' | 'BODY'
  minChars: number
  maxChars: number
}

/* ---------- List Block ---------- */
/* Bullet / numbered style is preserved from template */

export interface ListBlock extends BaseBlock {
  type: 'TEXT'
  role: 'LIST'
  content: string[]

  minItems: number
  maxItems: number

  itemConstraints: {
    minChars: number
    maxChars: number
    description?: string
  }
}

/* ---------- Image Block ---------- */

export interface ImageBlock extends BaseBlock {
  type: 'IMAGE'
  role: 'PRIMARY_VISUAL' | 'SUPPORTING_VISUAL'
  source?: 'icon_library' | 'stock_photo' | 'ai_photo' | 'generated' | 'p2_users'
  usage: string[] // for icon_library: semantic hints for AI matching
  // for stock_photo/ai_photo/generated: visual style hints
  iconLibraryId?: string // filled by AI — matched icon id from IconLibrary
  /** When source is 'icon_library', constrains selection to icons of this color variant. */
  iconLibraryColor?: IconColor
  width?: number
  height?: number
  replaceable: boolean
}

/* ---------- Union Block ---------- */

export type Block = TextBlock | ListBlock | ImageBlock

/* ---------- Slide Schema ---------- */

export interface SlideSchema {
  slideKey: string // e.g. "TITLE_SLIDE", "COMPANY_OVERVIEW"
  order: number // Position in presentation
  description: string // Slide intent (for LLM)

  templateSlideObjectId: string // Slide ID from TEMPLATE presentation

  blocks: Block[]
}

export type IconColor = 'black' | 'white'

export interface IconSchema {
  id: string
  label: string
  category: string
  tags: string[]
  pngUrl: string
  svgUrl?: string
  color: IconColor
}

export interface IconLibrary {
  version: string
  baseUrl: string
  icons: IconSchema[]
}

/* ---------- Presentation Schema ---------- */

export interface PresentationSchema {
  schemaVersion: string // e.g. "1.0"
  templateVersion: string // e.g. "company-deck-v3"
  id: string
  slides: SlideSchema[]
}

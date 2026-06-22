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
  usage: string[]        // for icon_library: semantic hints for AI matching
  // for stock_photo/ai_photo/generated: visual style hints
  iconLibraryId?: string // filled by AI — matched icon id from IconLibrary
  /** When source is 'icon_library', constrains selection to icons of this color variant. */
  iconLibraryColor?: IconColor

  /**
   * Agent-filled field for source 'ai_photo' or 'generated'.
   *
   * Workflow:
   *   1. Agent reads `description`, `usage`, and `generationContext` to write this prompt.
   *   2. Agent calls `image_generate` with `prompt = generationPrompt`, `aspectRatio = aspectRatio`.
   *   3. Agent puts the returned `imageUrl` into `content`.
   *   4. Leave empty in the template definition — agent fills it at runtime.
   *
   * Write a rich, specific prompt: subject, environment, lighting, mood, camera style.
   * Example: "cinematic wide photo of a modern open-plan office with employees collaborating,
   * warm natural light through floor-to-ceiling windows, no text, photorealistic"
   */
  generationPrompt?: string

  /**
   * Aspect ratio the agent must pass to `image_generate` when calling it for this block.
   * Derived from the shape's actual pixel dimensions on the slide.
   *
   * Supported values (must be one of these):
   *   '1:1' | '16:9' | '9:16' | '3:2' | '2:3' | '4:3' | '3:4' | '5:4' | '4:5' | '21:9'
   *
   * How to calculate from a Google Slides page element:
   *   ratio = scaleX / scaleY
   *   Pick the supported value whose numeric ratio is closest to that result.
   *
   * Examples:
   *   scaleX 1.7365, scaleY 0.7248 → 2.396:1 → closest is '21:9' (2.333:1)
   *   scaleX 1.778, scaleY 1.0    → 1.778:1 → closest is '16:9' (1.778:1)
   *   scaleX 1.0,   scaleY 1.0    → 1.0:1   → '1:1'
   */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '3:2' | '2:3' | '4:3' | '3:4' | '5:4' | '4:5' | '21:9'

  /**
   * Style and framing constraints the agent uses when writing `generationPrompt`.
   * Be specific: lighting, mood, subject framing, what to avoid (text, UI, logos).
   *
   * Examples:
   *   "professional stock photography, no text or UI overlays, ultra-wide landscape crop, corporate quality"
   *   "dark moody cinematic, shallow depth of field, no people"
   *   "flat illustration style, pastel colors, minimalist"
   */
  generationContext?: string

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

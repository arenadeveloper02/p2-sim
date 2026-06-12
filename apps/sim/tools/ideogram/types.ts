import type { ToolResponse } from '@/tools/types'
import type { IdeogramV4Element, IdeogramV4JsonPrompt } from '@/lib/ideogram/types'

export interface IdeogramPromptBuildParams {
  builderValue: unknown
}

export interface IdeogramPromptBuildMetadata {
  elementCount: number
  resolution: string
  renderingSpeed?: string
  hasStyleDescription: boolean
  bboxElementCount: number
}

export interface IdeogramPromptBuildResponse extends ToolResponse {
  output: {
    jsonPrompt: IdeogramV4JsonPrompt
    promptPreview: string
    elements: IdeogramV4Element[]
    metadata: IdeogramPromptBuildMetadata
  }
}

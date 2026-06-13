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
  hiddenElementCount: number
  magicPromptEnabled: boolean
}

export interface IdeogramPromptBuildResponse extends ToolResponse {
  output: {
    jsonPrompt: IdeogramV4JsonPrompt
    promptPreview: string
    magicPrompt: string
    elements: IdeogramV4Element[]
    metadata: IdeogramPromptBuildMetadata
  }
}

import type { ToolResponse } from '@/tools/types'

export type PresentationCreateParams = {
  operation: string
  numberOfSlides: number
  tone: string
  verbosity: string
  template?: string
  download?: boolean
  content?: string
}

export interface PresentationCreateResponse extends ToolResponse {
  output: {
    presentationFile?: any
    presentationId?: string
    message?: string
  }
}

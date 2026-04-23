import type { UserFile } from '@/executor/types'
import type { ToolResponse } from '@/tools/types'

export interface VisionParams {
  /** Optional when the matching provider key is set on the server (see Vision analyze API). */
  apiKey?: string
  imageUrl?: string
  imageFile?: UserFile
  model?: string
  prompt?: string
}

export interface VisionV2Params {
  apiKey?: string
  imageFile?: UserFile
  imageUrl?: string
  model?: string
  prompt?: string
}

export interface VisionResponse extends ToolResponse {
  output: {
    content: string
    model?: string
    tokens?: number
  }
}

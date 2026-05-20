import type { ToolResponse } from '@/tools/types'

export interface ImageGenerationWrapperParams extends Record<string, unknown> {
  prompt: string
  imageCount?: number
  model?: string
  _context?: Record<string, unknown>
}

export interface ImageGenerationWrapperResponse extends ToolResponse {
  output: {
    content: string
    image: string
    images: string[]
    metadata: Record<string, unknown>
    s3UploadFailed?: boolean
  }
}

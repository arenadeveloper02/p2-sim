import type { ToolResponse } from '@/tools/types'

export interface ImageGenerationParams {
  provider: 'openai' | 'gemini' | 'falai' | 'ideogram'
  apiKey?: string
  model?: string
  prompt?: string
  jsonPrompt?: unknown
  magicPrompt?: boolean
  remixImage?: unknown
  remixImageUrl?: string
  imageWeight?: number
  renderingSpeed?: 'FLASH' | 'TURBO' | 'DEFAULT' | 'QUALITY'
  enableCopyrightDetection?: boolean
  size?: string
  aspectRatio?: string
  resolution?: string
  quality?: string
  background?: string
  outputFormat?: string
  moderation?: string
  safetyTolerance?: string
  numImages?: number
  seed?: number
  enableSafetyChecker?: boolean
  enableWebSearch?: boolean
  thinkingLevel?: string
  inputImage?: unknown
  inputImages?: unknown[]
  inputImageUrl?: string
  inputImageUrls?: string
  inputImageMimeType?: string
  inputImageWarning?: string
}

export interface ImageGenerationResponse extends ToolResponse {
  output: {
    content: string
    image: unknown
    images: unknown[]
    imageUrl: string
    provider: string
    model: string
    metadata: {
      provider: string
      model: string
      description?: string
      revisedPrompt?: string
      seed?: number
      jobId?: string
      contentType?: string
      count?: number
      requested?: number
      failed?: number
      warnings?: string[]
      s3UploadFailed?: boolean
    }
    s3UploadFailed?: boolean
    __falaiCostDollars?: number
    __falaiBilling?: {
      endpointId: string
      requestId: string
      source: 'billing_events' | 'historical_estimate' | 'fallback_floor'
      outputUnits?: number | null
      unitPrice?: number | null
      percentDiscount?: number | null
      currency?: string
      error?: string
    }
  }
}

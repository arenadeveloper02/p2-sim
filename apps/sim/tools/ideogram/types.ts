import type { ToolResponse } from '@/tools/types'
import type { IdeogramOperation } from '@/tools/ideogram/constants'

/** Shared API key params for every Ideogram tool. */
export interface IdeogramAuthParams {
  /** Optional when IDEOGRAM_API_KEY is configured on the server. */
  apiKey?: string
}

/** Generated / edited image object returned by Ideogram. */
export interface IdeogramImageObject {
  url: string | null
  prompt?: string | null
  resolution?: string | null
  upscaledResolution?: string | null
  isImageSafe: boolean
  seed?: number | null
  styleType?: string | null
}

/** Common success envelope for image-producing Ideogram operations. */
export interface IdeogramImagesOutput {
  created: string | null
  images: IdeogramImageObject[]
  imageUrls: string[]
  content?: string
  image?: unknown
  imageUrl?: string
  responseType?: string | null
  s3UploadFailed?: boolean
  jsonPrompt?: unknown
  magicPromptUsed?: boolean
}

export interface IdeogramImagesResponse extends ToolResponse {
  output: IdeogramImagesOutput
}

export interface IdeogramGenerateV4Params extends IdeogramAuthParams {
  textPrompt?: string
  jsonPrompt?: unknown
  useMagicPrompt?: boolean
  resolution?: string
  renderingSpeed?: string
  enableCopyrightDetection?: boolean
}

export interface IdeogramGenerateV4AsyncParams extends IdeogramGenerateV4Params {
  webhookUrl: string
}

export interface IdeogramAsyncResponse extends ToolResponse {
  output: {
    generationId: string
    jsonPrompt?: unknown
    magicPromptUsed?: boolean
  }
}

export interface IdeogramPollGenerationParams extends IdeogramAuthParams {
  generationId: string
}

export interface IdeogramPollGenerationResponse extends ToolResponse {
  output: {
    generationId: string
    status: string
    created: string | null
    responseType: string | null
    images: IdeogramImageObject[]
    imageUrls: string[]
    content?: string
    image?: unknown
    imageUrl?: string
    s3UploadFailed?: boolean
  }
}

export interface IdeogramRemixV4Params extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  textPrompt: string
  imageWeight?: number
  resolution?: string
  renderingSpeed?: string
  enableCopyrightDetection?: boolean
}

export interface IdeogramMagicPromptV4Params extends IdeogramAuthParams {
  textPrompt: string
  aspectRatio?: string
}

export interface IdeogramMagicPromptV4Response extends ToolResponse {
  output: {
    jsonPrompt: unknown
    aspectRatio: string
  }
}

export interface IdeogramDescribeV4Params extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  includeBbox?: boolean
}

export interface IdeogramDescribeV4Response extends ToolResponse {
  output: {
    jsonPrompt: unknown
  }
}

export interface IdeogramGenerateV3Params extends IdeogramAuthParams {
  prompt: string
  seed?: number
  resolution?: string
  aspectRatio?: string
  renderingSpeed?: string
  magicPrompt?: string
  negativePrompt?: string
  numImages?: number
  styleType?: string
  stylePreset?: string
  colorPalette?: unknown
  styleCodes?: unknown
  styleReferenceImages?: unknown
  characterReferenceImages?: unknown
  characterReferenceImagesMask?: unknown
  customModelUri?: string
  enableCopyrightDetection?: boolean
}

export interface IdeogramGenerateTransparentV3Params extends IdeogramAuthParams {
  prompt: string
  seed?: number
  upscaleFactor?: string
  aspectRatio?: string
  renderingSpeed?: string
  magicPrompt?: string
  negativePrompt?: string
  numImages?: number
}

export interface IdeogramInpaintV3Params extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  mask?: unknown
  maskUrl?: string
  prompt: string
  magicPrompt?: string
  numImages?: number
  seed?: number
  renderingSpeed?: string
  styleType?: string
  stylePreset?: string
  colorPalette?: unknown
  styleCodes?: unknown
  styleReferenceImages?: unknown
  characterReferenceImages?: unknown
  characterReferenceImagesMask?: unknown
}

export interface IdeogramRemixV3Params extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  prompt: string
  imageWeight?: number
  seed?: number
  resolution?: string
  aspectRatio?: string
  renderingSpeed?: string
  magicPrompt?: string
  negativePrompt?: string
  numImages?: number
  colorPalette?: unknown
  styleCodes?: unknown
  styleType?: string
  stylePreset?: string
  styleReferenceImages?: unknown
  characterReferenceImages?: unknown
  characterReferenceImagesMask?: unknown
}

export interface IdeogramReframeV3Params extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  resolution: string
  numImages?: number
  seed?: number
  renderingSpeed?: string
  stylePreset?: string
  colorPalette?: unknown
  styleCodes?: unknown
  styleReferenceImages?: unknown
}

export interface IdeogramReplaceBackgroundV3Params extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  prompt: string
  magicPrompt?: string
  numImages?: number
  seed?: number
  renderingSpeed?: string
  stylePreset?: string
  colorPalette?: unknown
  styleCodes?: unknown
  styleReferenceImages?: unknown
}

export interface IdeogramRemoveBackgroundParams extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
}

export interface IdeogramRemoveBackgroundResponse extends ToolResponse {
  output: IdeogramImagesOutput
}

export interface IdeogramLayerizeTextParams extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  prompt?: string
  seed?: number
}

export interface IdeogramLayerizeTextResponse extends ToolResponse {
  output: {
    baseImageUrl: string
    originalImageUrl: string | null
    seed: number
    textBlocks?: unknown[]
    image?: unknown
    imageUrl?: string
    content?: string
    s3UploadFailed?: boolean
  }
}

export interface IdeogramEditParams extends IdeogramAuthParams {
  prompt: string
  images?: unknown
  imageUrls?: unknown
  numImages?: number
  seed?: number
  magicPrompt?: string
  resolution?: string
  aspectRatio?: string
  transparentBackground?: boolean
}

export interface IdeogramUpscaleParams extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  prompt?: string
  resemblance?: number
  detail?: number
  magicPromptOption?: string
  numImages?: number
  seed?: number
}

export interface IdeogramDescribeParams extends IdeogramAuthParams {
  image?: unknown
  imageUrl?: string
  describeModelVersion?: string
}

export interface IdeogramDescribeResponse extends ToolResponse {
  output: {
    descriptions: Array<{ text: string | null }>
  }
}

/** Body shape sent to the internal Ideogram proxy route. */
export interface IdeogramProxyBody {
  apiKey?: string
  operation: IdeogramOperation
  [key: string]: unknown
}

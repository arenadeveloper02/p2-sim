import type Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { verifyFileAccess } from '@/app/api/files/authorization'
import {
  isModelSafeWorkspaceFileKey,
  MODEL_UNSAFE_WORKSPACE_FILE_ERROR_MESSAGE,
} from '@/lib/uploads/contexts/workspace/workspace-file-secret-provenance'
import { transcodeHeicToJpeg, isHeifContainer } from '@/lib/uploads/server/heic'
import {
  MODEL_SUPPORTED_IMAGE_MIME_TYPES,
  processFilesToUserFiles,
  type RawFileInput,
} from '@/lib/uploads/utils/file-utils'
import { downloadFileFromStorage } from '@/lib/uploads/utils/file-utils.server'

const logger = createLogger('ArenaGenerativeUiVisualRef')

export const MAX_ARENA_GENERATIVE_SCREENSHOTS = 4
/** Anthropic vision cap is 5MB per image; leave headroom for base64. */
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024

const ANTHROPIC_IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export type ArenaGenerativeVisionImage = Extract<
  Anthropic.Messages.ContentBlockParam,
  { type: 'image' }
>

function anthropicMediaType(mime: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const normalized = mime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mime.toLowerCase()
  if (normalized === 'image/png') return 'image/png'
  if (normalized === 'image/gif') return 'image/gif'
  if (normalized === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

function sniffMime(buffer: Buffer, claimed: string): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    buffer.length >= 6 &&
    buffer.toString('ascii', 0, 3) === 'GIF'
  ) {
    return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return claimed.toLowerCase() === 'image/jpg' ? 'image/jpeg' : claimed.toLowerCase()
}

async function bufferToVisionImage(
  buffer: Buffer,
  claimedType: string,
  name: string
): Promise<ArenaGenerativeVisionImage> {
  let bytes = buffer
  let mime = sniffMime(buffer, claimedType)

  if (isHeifContainer(bytes) || mime === 'image/heic' || mime === 'image/heif') {
    const transcoded = await transcodeHeicToJpeg(bytes)
    if (!transcoded) {
      throw new Error(`Could not convert screenshot "${name}" from HEIC`)
    }
    bytes = transcoded
    mime = 'image/jpeg'
  }

  if (!MODEL_SUPPORTED_IMAGE_MIME_TYPES.has(mime) && !ANTHROPIC_IMAGE_MEDIA_TYPES.has(mime)) {
    throw new Error(`Screenshot "${name}" must be JPEG, PNG, GIF, or WebP`)
  }
  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new Error(`Screenshot "${name}" is too large (max 4MB)`)
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: anthropicMediaType(mime),
      data: bytes.toString('base64'),
    },
  }
}

export interface ResolveScreenshotsParams {
  files: RawFileInput[]
  userId: string
  requestId: string
}

/**
 * Downloads workspace uploads and returns Anthropic image blocks. Does not
 * inline caller-supplied base64 from the generate JSON body unless the
 * executor already attached it on a trusted UserFile.
 */
export async function resolveArenaGenerativeScreenshots(
  params: ResolveScreenshotsParams
): Promise<ArenaGenerativeVisionImage[]> {
  if (params.files.length === 0) return []
  if (params.files.length > MAX_ARENA_GENERATIVE_SCREENSHOTS) {
    throw new Error(`Upload at most ${MAX_ARENA_GENERATIVE_SCREENSHOTS} screenshots`)
  }

  const userFiles = processFilesToUserFiles(params.files, params.requestId, logger)
  if (userFiles.length === 0) {
    throw new Error('Screenshots could not be read')
  }

  const images: ArenaGenerativeVisionImage[] = []
  for (const userFile of userFiles) {
    const allowed = await verifyFileAccess(userFile.key, params.userId)
    if (!allowed) {
      throw new Error(`Screenshot "${userFile.name}" was not found`)
    }
    if (!(await isModelSafeWorkspaceFileKey(userFile.key))) {
      throw new Error(MODEL_UNSAFE_WORKSPACE_FILE_ERROR_MESSAGE)
    }

    let buffer: Buffer
    if (userFile.base64) {
      buffer = Buffer.from(userFile.base64, 'base64')
    } else {
      buffer = await downloadFileFromStorage(userFile, params.requestId, logger)
    }
    images.push(await bufferToVisionImage(buffer, userFile.type || 'image/jpeg', userFile.name))
  }
  return images
}

export function screenshotResolveErrorMessage(error: unknown): string {
  return getErrorMessage(error, 'Failed to read screenshots')
}

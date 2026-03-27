import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generatePptxFromCode } from '@/lib/execution/pptx-vm'
import { CopilotFiles, isStorageContextConfigured, isUsingCloudStorage } from '@/lib/uploads'
import type { StorageContext } from '@/lib/uploads/config'
import { parseWorkspaceFileKey } from '@/lib/uploads/contexts/workspace/workspace-file-manager'
import { downloadFile } from '@/lib/uploads/core/storage-service'
import { inferContextFromKey } from '@/lib/uploads/utils/file-utils'
import { canAccessAgentGeneratedImageViaDeployedChat } from '@/app/api/chat/utils'
import { verifyFileAccess } from '@/app/api/files/authorization'
import {
  createErrorResponse,
  createFileResponse,
  FileNotFoundError,
  findLocalFile,
  getContentType,
} from '@/app/api/files/utils'

const logger = createLogger('FilesServeAPI')

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

const MAX_COMPILED_PPTX_CACHE = 10
const compiledPptxCache = new Map<string, Buffer>()

function compiledCacheSet(key: string, buffer: Buffer): void {
  if (compiledPptxCache.size >= MAX_COMPILED_PPTX_CACHE) {
    compiledPptxCache.delete(compiledPptxCache.keys().next().value as string)
  }
  compiledPptxCache.set(key, buffer)
}

async function compilePptxIfNeeded(
  buffer: Buffer,
  filename: string,
  workspaceId?: string,
  raw?: boolean
): Promise<{ buffer: Buffer; contentType: string }> {
  const isPptx = filename.toLowerCase().endsWith('.pptx')
  if (raw || !isPptx || buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    return { buffer, contentType: getContentType(filename) }
  }

  const code = buffer.toString('utf-8')
  const cacheKey = createHash('sha256')
    .update(code)
    .update(workspaceId ?? '')
    .digest('hex')
  const cached = compiledPptxCache.get(cacheKey)
  if (cached) {
    return {
      buffer: cached,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }
  }

  const compiled = await generatePptxFromCode(code, workspaceId || '')
  compiledCacheSet(cacheKey, compiled)
  return {
    buffer: compiled,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
}

const STORAGE_KEY_PREFIX_RE = /^\d{13}-[a-z0-9]{7}-/

function stripStorageKeyPrefix(segment: string): string {
  return STORAGE_KEY_PREFIX_RE.test(segment) ? segment.replace(STORAGE_KEY_PREFIX_RE, '') : segment
}

function getWorkspaceIdForCompile(key: string): string | undefined {
  return parseWorkspaceFileKey(key) ?? undefined
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params

    if (!path || path.length === 0) {
      throw new FileNotFoundError('No file path provided')
    }

    logger.info('File serve request:', { path })

    const decodedPath = path.map((p) => decodeURIComponent(p))
    const fullPath = decodedPath.join('/')
    const isS3Path = decodedPath[0] === 's3'
    const isBlobPath = decodedPath[0] === 'blob'
    const isCloudPath = isS3Path || isBlobPath
    const cloudKey = isCloudPath ? decodedPath.slice(1).join('/') : fullPath

    // Handle agent-generated-images paths specially
    if (fullPath.startsWith('agent-generated-images/')) {
      const pathSegments = fullPath.split('/')
      const hasValidStructure =
        pathSegments.length >= 4 &&
        pathSegments[0] === 'agent-generated-images' &&
        pathSegments[1] &&
        pathSegments[2] &&
        pathSegments[3]

      if (!hasValidStructure) {
        logger.warn(
          'Agent-generated-image path must be agent-generated-images/[workflow_id]/[user_id]/[image]',
          {
            fullPath,
            segmentCount: pathSegments.length,
          }
        )
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const workflowIdFromPath = pathSegments[1]
      logger.info('Agent-generated-image serve: checking auth', { fullPath, workflowIdFromPath })

      const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
      let userId: string
      let authType: string

      if (authResult.success && authResult.userId) {
        userId = authResult.userId
        authType = authResult.authType ?? 'hybrid'
        logger.info('Agent-generated-image serve: hybrid auth success', {
          userId,
          authType,
        })
      } else {
        const deployedChatOk = await canAccessAgentGeneratedImageViaDeployedChat(
          request,
          workflowIdFromPath
        )
        if (!deployedChatOk) {
          logger.warn('Unauthorized agent-generated-image access attempt', {
            path,
            fullPath,
            error: authResult.error || 'Missing userId',
            authType: authResult.authType,
          })
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        userId = 'deployed-chat-viewer'
        authType = 'deployed_chat'
        logger.info('Agent-generated-image serve: deployed chat access', {
          workflowIdFromPath,
        })
      }

      // Any authenticated user may view agent-generated images
      // Serve agent-generated-images file (cloud if context configured, else local)
      const agentImagesInCloud = isStorageContextConfigured('agent-generated-images')
      logger.info('Agent-generated-image serve: storage mode', {
        agentImagesInCloud,
        fullPath,
      })
      if (agentImagesInCloud) {
        return await handleAgentGeneratedImageCloud(fullPath, userId)
      }
      return await handleAgentGeneratedImageLocal(fullPath, userId)
    }

    const contextParam = request.nextUrl.searchParams.get('context')
    const raw = request.nextUrl.searchParams.get('raw') === '1'

    const context = contextParam || (isCloudPath ? inferContextFromKey(cloudKey) : undefined)

    if (context === 'profile-pictures' || context === 'og-images') {
      logger.info(`Serving public ${context}:`, { cloudKey })
      if (isUsingCloudStorage() || isCloudPath) {
        return await handleCloudProxyPublic(cloudKey, context)
      }
      return await handleLocalFilePublic(fullPath)
    }

    const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })

    if (!authResult.success || !authResult.userId) {
      logger.warn('Unauthorized file access attempt', {
        path,
        error: authResult.error || 'Missing userId',
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authResult.userId

    if (isUsingCloudStorage()) {
      return await handleCloudProxy(cloudKey, userId, contextParam, raw)
    }

    return await handleLocalFile(cloudKey, userId, raw)
  } catch (error) {
    logger.error('Error serving file:', error)

    if (error instanceof FileNotFoundError) {
      return createErrorResponse(error)
    }

    return createErrorResponse(error instanceof Error ? error : new Error('Failed to serve file'))
  }
}

async function handleLocalFile(
  filename: string,
  userId: string,
  raw: boolean
): Promise<NextResponse> {
  try {
    const contextParam: StorageContext | undefined = inferContextFromKey(filename) as
      | StorageContext
      | undefined

    const hasAccess = await verifyFileAccess(
      filename,
      userId,
      undefined, // customConfig
      contextParam, // context
      true // isLocal
    )

    if (!hasAccess) {
      logger.warn('Unauthorized local file access attempt', { userId, filename })
      throw new FileNotFoundError(`File not found: ${filename}`)
    }

    const filePath = await findLocalFile(filename)

    if (!filePath) {
      throw new FileNotFoundError(`File not found: ${filename}`)
    }

    const rawBuffer = await readFile(filePath)
    const segment = filename.split('/').pop() || filename
    const displayName = stripStorageKeyPrefix(segment)
    const workspaceId = getWorkspaceIdForCompile(filename)
    const { buffer: fileBuffer, contentType } = await compilePptxIfNeeded(
      rawBuffer,
      displayName,
      workspaceId,
      raw
    )

    logger.info('Local file served', { userId, filename, size: fileBuffer.length })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename: displayName,
      cacheControl: contextParam === 'workspace' ? 'private, no-cache, must-revalidate' : undefined,
    })
  } catch (error) {
    logger.error('Error reading local file:', error)
    throw error
  }
}

async function handleCloudProxy(
  cloudKey: string,
  userId: string,
  contextParam?: string | null,
  raw = false
): Promise<NextResponse> {
  try {
    let context: StorageContext

    if (contextParam) {
      context = contextParam as StorageContext
      logger.info(`Using explicit context: ${context} for key: ${cloudKey}`)
    } else {
      context = inferContextFromKey(cloudKey)
      logger.info(`Inferred context: ${context} from key pattern: ${cloudKey}`)
    }

    const hasAccess = await verifyFileAccess(
      cloudKey,
      userId,
      undefined, // customConfig
      context, // context
      false // isLocal
    )

    if (!hasAccess) {
      logger.warn('Unauthorized cloud file access attempt', { userId, key: cloudKey, context })
      throw new FileNotFoundError(`File not found: ${cloudKey}`)
    }

    let rawBuffer: Buffer

    if (context === 'copilot') {
      rawBuffer = await CopilotFiles.downloadCopilotFile(cloudKey)
    } else {
      rawBuffer = await downloadFile({
        key: cloudKey,
        context,
      })
    }

    const segment = cloudKey.split('/').pop() || 'download'
    const displayName = stripStorageKeyPrefix(segment)
    const workspaceId = getWorkspaceIdForCompile(cloudKey)
    const { buffer: fileBuffer, contentType } = await compilePptxIfNeeded(
      rawBuffer,
      displayName,
      workspaceId,
      raw
    )

    logger.info('Cloud file served', {
      userId,
      key: cloudKey,
      size: fileBuffer.length,
      context,
    })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename: displayName,
      cacheControl: context === 'workspace' ? 'private, no-cache, must-revalidate' : undefined,
    })
  } catch (error) {
    logger.error('Error downloading from cloud storage:', error)
    throw error
  }
}

async function handleCloudProxyPublic(
  cloudKey: string,
  context: StorageContext
): Promise<NextResponse> {
  try {
    let fileBuffer: Buffer

    if (context === 'copilot') {
      fileBuffer = await CopilotFiles.downloadCopilotFile(cloudKey)
    } else {
      fileBuffer = await downloadFile({
        key: cloudKey,
        context,
      })
    }

    const filename = cloudKey.split('/').pop() || 'download'
    const contentType = getContentType(filename)

    logger.info('Public cloud file served', {
      key: cloudKey,
      size: fileBuffer.length,
      context,
    })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename,
    })
  } catch (error) {
    logger.error('Error serving public cloud file:', error)
    throw error
  }
}

async function handleLocalFilePublic(filename: string): Promise<NextResponse> {
  try {
    const filePath = await findLocalFile(filename)

    if (!filePath) {
      throw new FileNotFoundError(`File not found: ${filename}`)
    }

    const fileBuffer = await readFile(filePath)
    const contentType = getContentType(filename)

    logger.info('Public local file served', { filename, size: fileBuffer.length })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename,
    })
  } catch (error) {
    logger.error('Error reading public local file:', error)
    throw error
  }
}

async function handleAgentGeneratedImageLocal(
  filename: string,
  userId: string
): Promise<NextResponse> {
  try {
    logger.info('Looking for agent-generated image:', { filename, userId })

    const filePath = findLocalFile(filename)

    if (!filePath) {
      // Try direct path resolution as fallback
      const { join, resolve } = await import('path')
      const directPath = resolve(process.cwd(), filename)
      const { existsSync } = await import('fs')

      logger.warn('File not found via findLocalFile, trying direct path:', {
        filename,
        filePath,
        directPath,
        exists: existsSync(directPath),
      })

      if (existsSync(directPath)) {
        const fileBuffer = await readFile(directPath)
        const contentType = getContentType(filename)

        logger.info('Agent-generated image served locally (direct path)', {
          userId,
          filename,
          size: fileBuffer.length,
        })

        return createFileResponse({
          buffer: fileBuffer,
          contentType,
          filename,
        })
      }

      throw new FileNotFoundError(`File not found: ${filename}`)
    }

    const fileBuffer = await readFile(filePath)
    const contentType = getContentType(filename)

    logger.info('Agent-generated image served locally', {
      userId,
      filename,
      filePath,
      size: fileBuffer.length,
    })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename,
    })
  } catch (error) {
    logger.error('Error reading agent-generated image:', error)
    throw error
  }
}

async function handleAgentGeneratedImageCloud(
  cloudKey: string,
  userId: string
): Promise<NextResponse> {
  try {
    const fileBuffer = await downloadFile({
      key: cloudKey,
      context: 'agent-generated-images',
    })

    const originalFilename = cloudKey.split('/').pop() || 'download'
    const contentType = getContentType(originalFilename)

    logger.info('Agent-generated image served from cloud', {
      userId,
      key: cloudKey,
      size: fileBuffer.length,
    })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename: originalFilename,
    })
  } catch (error) {
    logger.error('Error downloading agent-generated image from cloud:', error)
    throw error
  }
}

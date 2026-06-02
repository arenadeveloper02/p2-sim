import { readFile } from 'fs/promises'
import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { fileServeParamsSchema, fileServeQuerySchema } from '@/lib/api/contracts/storage-transfer'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { CopilotFiles, isStorageContextConfigured, isUsingCloudStorage } from '@/lib/uploads'
import type { StorageContext } from '@/lib/uploads/config'
import { downloadFile } from '@/lib/uploads/core/storage-service'
import {
  compileDocumentIfNeeded,
  getWorkspaceIdForCompile,
} from '@/lib/uploads/utils/compile-document'
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

const STORAGE_KEY_PREFIX_RE = /^\d{13}-[a-z0-9]{7}-/

function stripStorageKeyPrefix(segment: string): string {
  return STORAGE_KEY_PREFIX_RE.test(segment) ? segment.replace(STORAGE_KEY_PREFIX_RE, '') : segment
}

export const GET = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
    try {
      const paramsResult = fileServeParamsSchema.safeParse(await params)
      if (!paramsResult.success) {
        throw new FileNotFoundError('No file path provided')
      }
      const { path } = paramsResult.data

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

        if (authResult.success && authResult.userId) {
          userId = authResult.userId
          logger.info('Agent-generated-image serve: hybrid auth success', {
            userId,
            authType: authResult.authType ?? 'hybrid',
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
          logger.info('Agent-generated-image serve: deployed chat access', {
            workflowIdFromPath,
          })
        }

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

      if (fullPath.startsWith('execution/')) {
        const pathSegments = fullPath.split('/')
        const hasValidStructure =
          pathSegments.length >= 5 &&
          pathSegments[0] === 'execution' &&
          pathSegments[1] &&
          pathSegments[2] &&
          pathSegments[3] &&
          pathSegments[4]

        if (!hasValidStructure) {
          logger.warn(
            'Execution file path must be execution/[workspace_id]/[workflow_id]/[execution_id]/[file]',
            { fullPath, segmentCount: pathSegments.length }
          )
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        const workflowIdFromPath = pathSegments[2]
        const raw = request.nextUrl.searchParams.get('raw') === '1'
        logger.info('Execution file serve: checking auth', { fullPath, workflowIdFromPath })

        const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })

        if (authResult.success && authResult.userId) {
          logger.info('Execution file serve: hybrid auth success', {
            userId: authResult.userId,
            authType: authResult.authType ?? 'hybrid',
          })
          if (isUsingCloudStorage()) {
            return await handleCloudProxy(cloudKey, authResult.userId, raw, request.signal)
          }
          return await handleLocalFile(cloudKey, authResult.userId, raw, request.signal)
        }

        const deployedChatOk = await canAccessAgentGeneratedImageViaDeployedChat(
          request,
          workflowIdFromPath
        )
        if (!deployedChatOk) {
          logger.warn('Unauthorized execution file access attempt', {
            path,
            fullPath,
            error: authResult.error || 'Missing userId',
            authType: authResult.authType,
          })
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        logger.info('Execution file serve: deployed chat access', { workflowIdFromPath })
        if (isUsingCloudStorage()) {
          return await handleDeployedChatExecutionFileCloud(fullPath)
        }
        return await handleDeployedChatExecutionFileLocal(fullPath)
      }

      const isPublicByKeyPrefix =
        cloudKey.startsWith('profile-pictures/') ||
        cloudKey.startsWith('og-images/') ||
        cloudKey.startsWith('workspace-logos/')

      if (isPublicByKeyPrefix) {
        const context = inferContextFromKey(cloudKey)
        logger.info(`Serving public ${context}:`, { cloudKey })
        if (isUsingCloudStorage() || isCloudPath) {
          return await handleCloudProxyPublic(cloudKey, context)
        }
        return await handleLocalFilePublic(fullPath)
      }

      const query = fileServeQuerySchema.parse({
        raw: request.nextUrl.searchParams.get('raw'),
      })
      const raw = query.raw === '1'

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
        return await handleCloudProxy(cloudKey, userId, raw, request.signal)
      }

      return await handleLocalFile(cloudKey, userId, raw, request.signal)
    } catch (error) {
      logger.error('Error serving file:', error)

      if (error instanceof FileNotFoundError) {
        return createErrorResponse(error)
      }

      return createErrorResponse(error instanceof Error ? error : new Error('Failed to serve file'))
    }
  }
)

async function handleLocalFile(
  filename: string,
  userId: string,
  raw: boolean,
  signal: AbortSignal | undefined
): Promise<NextResponse> {
  const ownerKey = `user:${userId}`
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
    const { buffer: fileBuffer, contentType } = await compileDocumentIfNeeded(
      rawBuffer,
      displayName,
      workspaceId,
      raw,
      ownerKey,
      signal
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
  raw = false,
  signal: AbortSignal | undefined = undefined
): Promise<NextResponse> {
  const ownerKey = `user:${userId}`
  try {
    const context = inferContextFromKey(cloudKey)
    logger.info(`Inferred context: ${context} from key pattern: ${cloudKey}`)

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
    const { buffer: fileBuffer, contentType } = await compileDocumentIfNeeded(
      rawBuffer,
      displayName,
      workspaceId,
      raw,
      ownerKey,
      signal
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

    const filePath = await findLocalFile(filename)

    if (!filePath) {
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

async function handleDeployedChatExecutionFileLocal(filename: string): Promise<NextResponse> {
  try {
    const filePath = await findLocalFile(filename)

    if (!filePath) {
      throw new FileNotFoundError(`File not found: ${filename}`)
    }

    const fileBuffer = await readFile(filePath)
    const contentType = getContentType(filename)

    logger.info('Execution file served locally for deployed chat', {
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
    logger.error('Error reading execution file for deployed chat:', error)
    throw error
  }
}

async function handleDeployedChatExecutionFileCloud(cloudKey: string): Promise<NextResponse> {
  try {
    const fileBuffer = await downloadFile({
      key: cloudKey,
      context: 'execution',
    })

    const originalFilename = cloudKey.split('/').pop() || 'download'
    const contentType = getContentType(originalFilename)

    logger.info('Execution file served from cloud for deployed chat', {
      key: cloudKey,
      size: fileBuffer.length,
    })

    return createFileResponse({
      buffer: fileBuffer,
      contentType,
      filename: originalFilename,
    })
  } catch (error) {
    logger.error('Error downloading execution file for deployed chat:', error)
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

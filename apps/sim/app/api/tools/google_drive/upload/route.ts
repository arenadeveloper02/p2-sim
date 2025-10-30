import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { downloadExecutionFile } from '@/lib/workflows/execution-file-storage'
import type { UserFile } from '@/executor/types'
import { GOOGLE_WORKSPACE_MIME_TYPES, SOURCE_MIME_TYPES } from '@/tools/google_drive/utils'

const logger = createLogger('GoogleDriveUploadAPI')

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { accessToken, fileName, file, content, mimeType, folderId, folderSelector } = data

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing required field: accessToken' }, { status: 400 })
    }
    if (!fileName) {
      return NextResponse.json({ error: 'Missing required field: fileName' }, { status: 400 })
    }

    // Determine if we're uploading a file or text content
    let fileContent: string | ArrayBuffer
    let uploadMimeType: string
    let finalFileName = fileName

    if (file && typeof file === 'object') {
      // File from previous block - can be UserFile (with key) or raw file data (with data)
      try {
        // Check if this is a processed UserFile (has key) or raw file data (has data)
        if ('key' in file && file.key) {
          // Processed UserFile - download from execution storage
          const userFile = file as UserFile

          logger.info(`Downloading file from execution storage: ${userFile.name}`)

          // Download file from execution storage
          const fileBuffer = await downloadExecutionFile(userFile)

          // Convert to base64 for text-based upload or use ArrayBuffer for binary
          const requestedMimeType = mimeType || userFile.type || 'application/octet-stream'

          // For Google Workspace formats, use the appropriate source MIME type
          uploadMimeType = GOOGLE_WORKSPACE_MIME_TYPES.includes(requestedMimeType)
            ? SOURCE_MIME_TYPES[requestedMimeType] || 'text/plain'
            : requestedMimeType

          // For binary files (like PPTX), use ArrayBuffer directly
          if (
            uploadMimeType.includes('application/vnd') ||
            uploadMimeType.includes('application/octet-stream')
          ) {
            // Use ArrayBuffer only for real ArrayBuffer, not SharedArrayBuffer
            if (fileBuffer.buffer instanceof ArrayBuffer) {
              fileContent = fileBuffer.buffer as ArrayBuffer
            } else {
              // Fallback: treat as text and convert to string
              fileContent = fileBuffer.toString('utf-8')
            }
          } else {
            // For text files, convert to string
            fileContent = fileBuffer.toString('utf-8')
          }

          // Use file's name if fileName not provided or is default
          if (userFile.name && (!fileName || fileName === 'upload')) {
            finalFileName = userFile.name
          }

          logger.info(`Downloaded file: ${userFile.name} (${fileBuffer.length} bytes)`)
        } else if ('content' in file && file.content) {
          // Raw file data (ToolFileData format) - hasn't been processed by FileToolProcessor yet
          logger.info(`Processing raw file data: ${file.name || 'unknown'}`)

          let fileBuffer: Buffer

          // Handle base64 string data
          if (typeof file.content === 'string') {
            let base64Data = file.content

            // Convert base64url to base64 if needed
            if (base64Data && (base64Data.includes('-') || base64Data.includes('_'))) {
              base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/')
            }

            fileBuffer = Buffer.from(base64Data, 'base64')
            logger.info(`Converted base64 string to Buffer (${fileBuffer.length} bytes)`)
          } else if (Buffer.isBuffer(file.content)) {
            fileBuffer = file.content
          } else {
            return NextResponse.json(
              { error: 'Invalid file data format: data must be base64 string or Buffer' },
              { status: 400 }
            )
          }

          // Determine MIME type
          const requestedMimeType =
            mimeType || file.mimeType || (file as any).mimetype || 'application/octet-stream'

          // For Google Workspace formats, use the appropriate source MIME type
          uploadMimeType = GOOGLE_WORKSPACE_MIME_TYPES.includes(requestedMimeType)
            ? SOURCE_MIME_TYPES[requestedMimeType] || 'text/plain'
            : requestedMimeType

          // For binary files (like PPTX), use ArrayBuffer directly
          if (
            uploadMimeType.includes('application/vnd') ||
            uploadMimeType.includes('application/octet-stream')
          ) {
            if (fileBuffer.buffer instanceof ArrayBuffer) {
              fileContent = fileBuffer.buffer as ArrayBuffer
            } else {
              fileContent = fileBuffer.toString('utf-8')
            }
          } else {
            // For text files, convert to string
            fileContent = fileBuffer.toString('utf-8')
          }

          // Use file's name if fileName not provided or is default
          const fileFileName =
            fileName || file.name || (file as any).filename || 'presentation.pptx'
          if (fileFileName && (!fileName || fileName === 'upload')) {
            finalFileName = fileFileName
          }

          logger.info(`Processed raw file data: ${fileFileName} (${fileBuffer.length} bytes)`)
        } else {
          return NextResponse.json(
            {
              error:
                'Invalid file object: must have either "key" (UserFile) or "data" (raw file data)',
            },
            { status: 400 }
          )
        }
      } catch (error) {
        logger.error('Error processing file:', error)
        return NextResponse.json(
          {
            error: 'Failed to process file',
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 500 }
        )
      }
    } else if (content) {
      // Text content provided directly
      fileContent = content
      uploadMimeType = mimeType || 'text/plain'
    } else {
      return NextResponse.json(
        { error: 'Either file or content must be provided' },
        { status: 400 }
      )
    }

    // Use folderSelector if provided, otherwise use folderId
    const parentFolderId = (folderSelector || folderId || '').trim()

    // Create file metadata in Google Drive
    const metadata: {
      name: string
      mimeType: string
      parents?: string[]
    } = {
      name: finalFileName,
      mimeType: mimeType || 'text/plain',
    }

    if (parentFolderId) {
      metadata.parents = [parentFolderId]
    }

    logger.info('Creating file in Google Drive', {
      fileName: finalFileName,
      mimeType: metadata.mimeType,
      hasParent: !!parentFolderId,
    })

    // Step 1: Create the file in Google Drive
    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    )

    if (!createResponse.ok) {
      const errorData = await createResponse.json()
      logger.error('Failed to create file in Google Drive', {
        status: createResponse.status,
        error: errorData,
      })
      return NextResponse.json(errorData, { status: createResponse.status })
    }

    const createData = await createResponse.json()
    const fileId = createData.id

    // Step 2: Upload content to the file
    logger.info('Uploading content to file', {
      fileId,
      fileName: finalFileName,
      uploadMimeType,
    })

    const uploadResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': uploadMimeType,
        },
        body: fileContent instanceof ArrayBuffer ? new Uint8Array(fileContent) : fileContent,
      }
    )

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.json()
      logger.error('Failed to upload content to file', {
        status: uploadResponse.status,
        error: uploadError,
      })
      return NextResponse.json(uploadError, { status: uploadResponse.status })
    }

    // Step 3: For Google Workspace documents, update the name again to ensure it sticks after conversion
    if (GOOGLE_WORKSPACE_MIME_TYPES.includes(mimeType || '')) {
      logger.info('Updating file name after conversion', {
        fileId,
        fileName: finalFileName,
      })

      const updateNameResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: finalFileName,
          }),
        }
      )

      if (!updateNameResponse.ok) {
        logger.warn('Failed to update filename after conversion, but content was uploaded', {
          status: updateNameResponse.status,
        })
      }
    }

    // Step 4: Get the final file data
    const finalFileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,webContentLink,size,createdTime,modifiedTime,parents`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!finalFileResponse.ok) {
      const errorData = await finalFileResponse.json()
      logger.error('Failed to get final file data', {
        status: finalFileResponse.status,
        error: errorData,
      })
      return NextResponse.json(errorData, { status: finalFileResponse.status })
    }

    const finalFile = await finalFileResponse.json()

    return NextResponse.json({
      success: true,
      output: {
        file: {
          id: finalFile.id,
          name: finalFile.name,
          mimeType: finalFile.mimeType,
          webViewLink: finalFile.webViewLink,
          webContentLink: finalFile.webContentLink,
          size: finalFile.size,
          createdTime: finalFile.createdTime,
          modifiedTime: finalFile.modifiedTime,
          parents: finalFile.parents,
        },
      },
    })
  } catch (error) {
    logger.error('Error in Google Drive upload API:', error)
    return NextResponse.json(
      {
        error: 'Failed to upload file to Google Drive',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

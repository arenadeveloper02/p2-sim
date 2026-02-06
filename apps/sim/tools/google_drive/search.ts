import { createLogger } from '@sim/logger'
import { TextChunker } from '@/lib/chunkers/text-chunker'
import { rerankContent } from '@/lib/content/rerank'
import type { GoogleDriveSearchParams, GoogleDriveSearchResponse } from '@/tools/google_drive/types'
import { DEFAULT_EXPORT_FORMATS, GOOGLE_WORKSPACE_MIME_TYPES } from '@/tools/google_drive/utils'
import type { ToolConfig } from '@/tools/types'
import { buildDriveQueryWithAI } from './ai-query-generation'

const logger = createLogger('GoogleDriveSearchTool')

/**
 * Splits content into passages for reranking using the TextChunker strategy.
 * Uses hierarchical splitting with semantic boundaries (paragraphs, sentences, etc.)
 */
async function splitContentIntoPassages(
  content: string,
  maxPassageLength = 1000,
  minPassageLength = 100
): Promise<string[]> {
  if (!content || content.trim().length === 0) {
    return []
  }

  // Convert character-based maxPassageLength to tokens (1 token ≈ 4 characters)
  // Use a slightly smaller chunk size to account for token estimation variance
  const chunkSizeInTokens = Math.floor((maxPassageLength / 4) * 0.9) // 90% to be safe

  // Create chunker with appropriate settings
  const chunker = new TextChunker({
    chunkSize: chunkSizeInTokens,
    chunkOverlap: 0, // No overlap for reranking passages
    minCharactersPerChunk: minPassageLength,
  })

  // Chunk the content
  const chunks = await chunker.chunk(content)

  // Extract text from chunks
  return chunks.map((chunk) => chunk.text).filter((text) => text.trim().length >= minPassageLength)
}

/**
 * Parses time window patterns from prompt:
 * - today
 * - yesterday
 * - last week
 * - last month
 * - last N days
 * Returns ISO timestamps (start, end) in RFC3339 format or (null, null)
 */
function parseTimeWindow(prompt: string): [string | null, string | null] {
  const p = prompt.toLowerCase()
  const now = new Date()
  const end = now

  let start: Date | null = null

  if (p.includes('today')) {
    start = new Date(now)
    start.setHours(0, 0, 0, 0)
  } else if (p.includes('yesterday')) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    start = new Date(yesterday)
    start.setHours(0, 0, 0, 0)
    end.setTime(yesterday.getTime())
    end.setHours(23, 59, 59, 999)
  } else if (p.includes('last week')) {
    start = new Date(now)
    start.setDate(start.getDate() - 7)
  } else if (p.includes('last month')) {
    start = new Date(now)
    start.setMonth(start.getMonth() - 1)
  } else {
    const lastNDaysMatch = p.match(/last\s+(\d+)\s+days?/)
    if (lastNDaysMatch) {
      const days = Number.parseInt(lastNDaysMatch[1], 10)
      if (Number.isFinite(days) && days > 0) {
        start = new Date(now)
        start.setDate(start.getDate() - days)
      }
    }
  }

  if (!start) {
    return [null, null]
  }

  // Convert to RFC3339 format (Google Drive API expects this)
  const toRFC3339 = (dt: Date): string => {
    return dt.toISOString()
  }

  return [toRFC3339(start), toRFC3339(end)]
}

/**
 * Maps common keywords to Drive mime types.
 * Returns a list (OR-filtered) of mime types.
 */
function detectMimeTypes(prompt: string): string[] {
  const p = prompt.toLowerCase()
  const mimes: string[] = []

  if (p.includes('pdf')) {
    mimes.push('application/pdf')
  }

  // Slides / decks / presentations
  if (
    ['deck', 'decks', 'slides', 'slide', 'presentation', 'presentations', 'ppt', 'pptx'].some((w) =>
      p.includes(w)
    )
  ) {
    mimes.push('application/vnd.google-apps.presentation')
  }

  // Docs
  if (['doc', 'docs', 'document', 'documents'].some((w) => p.includes(w))) {
    mimes.push('application/vnd.google-apps.document')
  }

  // Sheets
  if (
    ['sheet', 'sheets', 'spreadsheet', 'spreadsheets', 'excel', 'xlsx'].some((w) => p.includes(w))
  ) {
    mimes.push('application/vnd.google-apps.spreadsheet')
  }

  // Folders
  if (p.includes('folder')) {
    mimes.push('application/vnd.google-apps.folder')
  }

  // De-duplicate preserving order
  const seen = new Set<string>()
  return mimes.filter((m) => {
    if (seen.has(m)) return false
    seen.add(m)
    return true
  })
}

/**
 * Extracts folder name from prompt:
 * - in folder Marketing
 * - folder:Marketing
 * - folder:"Marketing Assets"
 */
function extractFolderName(prompt: string): string | null {
  // folder:"Marketing Assets"
  const quotedMatch = prompt.match(/folder\s*:\s*"([^"]+)"/i)
  if (quotedMatch) {
    return quotedMatch[1].trim()
  }

  // folder:Marketing
  const colonMatch = prompt.match(/folder\s*:\s*([A-Za-z0-9 _.&-]+)/i)
  if (colonMatch) {
    return colonMatch[1].trim()
  }

  // in folder Marketing Assets
  const inFolderMatch = prompt.match(/in\s+folder\s+([A-Za-z0-9 _.&-]+)/i)
  if (inFolderMatch) {
    return inFolderMatch[1].trim()
  }

  return null
}

/**
 * Extracts keywords from prompt:
 * - Removes stop words
 * - Keeps tokens length >= 2
 * - Preserves alphanumeric tokens
 */
function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    'find',
    'search',
    'show',
    'me',
    'my',
    'the',
    'a',
    'an',
    'of',
    'for',
    'from',
    'in',
    'on',
    'to',
    'with',
    'and',
    'or',
    'files',
    'file',
    'last',
    'week',
    'month',
    'days',
    'day',
    'today',
    'yesterday',
    'recent',
    'recently',
    'please',
    'within',
    'between',
    'after',
    'before',
    'folder',
    'give',
    'get',
    'list',
    'lists',
    'which',
    'are',
    'is',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'available',
    'availability',
    'what',
    'where',
    'when',
    'who',
    'how',
  ])

  const tokens = prompt.match(/[A-Za-z0-9\-_]+/g) || []
  const seen = new Set<string>()
  const keywords: string[] = []

  // Ignore type-hints that are mapped to mime types
  const ignoreLiterals = new Set([
    'deck',
    'decks',
    'slides',
    'slide',
    'presentation',
    'presentations',
    'pdf',
    'ppt',
    'pptx',
  ])

  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (stopWords.has(lower)) continue
    if (token.length < 2) continue
    if (ignoreLiterals.has(lower)) continue
    if (seen.has(lower)) continue

    keywords.push(token)
    seen.add(lower)

    // Limit to 10 keywords
    if (keywords.length >= 10) break
  }

  return keywords
}

/**
 * Resolves folder ID by name using Google Drive API
 */
async function resolveFolderIdByName(
  accessToken: string,
  folderName: string,
  pageSize = '5'
): Promise<string | null> {
  const safeName = folderName.replace(/'/g, "\\'")

  const query = `trashed=false and mimeType='application/vnd.google-apps.folder' and name = '${safeName}'`

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.append('q', query)
  url.searchParams.append('pageSize', pageSize)
  url.searchParams.append('fields', 'files(id,name,modifiedTime,parents,driveId),nextPageToken')
  url.searchParams.append('orderBy', 'modifiedTime desc')
  url.searchParams.append('includeItemsFromAllDrives', 'true')
  url.searchParams.append('supportsAllDrives', 'true')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      logger.warn('Failed to resolve folder by name', {
        folderName,
        error: data.error?.message,
      })
      return null
    }

    const data = await response.json()
    const files = data.files || []

    if (files.length === 0) {
      return null
    }

    // Return the most recently modified folder
    return files[0].id
  } catch (error) {
    logger.error('Error resolving folder by name', { folderName, error })
    return null
  }
}

/**
 * Extracts content from a Google Drive file using its ID
 * Downloads files as binary and parses them to extract text content
 */
async function extractFileContent(
  fileId: string,
  mimeType: string,
  fileName: string,
  accessToken: string
): Promise<{ content: string; extractionMethod: string } | null> {
  try {
    // Skip folders
    if (mimeType === 'application/vnd.google-apps.folder') {
      return null
    }

    const authHeader = `Bearer ${accessToken}`

    // For Google Workspace files, export them (these are already text-based)
    if (GOOGLE_WORKSPACE_MIME_TYPES.includes(mimeType)) {
      const exportFormat = DEFAULT_EXPORT_FORMATS[mimeType] || 'text/plain'
      logger.info('Exporting Google Workspace file for content extraction', {
        fileId,
        mimeType,
        exportFormat,
      })

      const exportResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportFormat)}&supportsAllDrives=true`,
        {
          headers: {
            Authorization: authHeader,
          },
        }
      )

      if (!exportResponse.ok) {
        const exportError = await exportResponse.json().catch(() => ({}))
        logger.warn('Failed to export file for content extraction', {
          fileId,
          status: exportResponse.status,
          error: exportError,
        })
        return null
      }

      const content = await exportResponse.text()
      return {
        content,
        extractionMethod: 'google-drive-export',
      }
    }

    // For regular files, download as binary and parse
    logger.info('Downloading file for content extraction', {
      fileId,
      mimeType,
      fileName,
    })

    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      {
        headers: {
          Authorization: authHeader,
        },
      }
    )

    if (!downloadResponse.ok) {
      const downloadError = await downloadResponse.json().catch(() => ({}))
      logger.warn('Failed to download file for content extraction', {
        fileId,
        status: downloadResponse.status,
        error: downloadError,
      })
      return null
    }

    // Only attempt to parse files on the server side (file parsers use Node.js modules)
    // Check if we're in a server environment
    if (typeof window !== 'undefined') {
      // Client-side: skip parsing, return null
      logger.warn('File parsing skipped on client side', { fileId, mimeType })
      return null
    }

    // Download as ArrayBuffer to handle binary files
    const arrayBuffer = await downloadResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // For text-based files, extract content directly
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/x-javascript'
    ) {
      try {
        const content = buffer.toString('utf-8')
        return {
          content,
          extractionMethod: 'text-utf8',
        }
      } catch (error) {
        logger.warn('Failed to read file as UTF-8 text', {
          fileId,
          mimeType,
          error,
        })
      }
    }

    // Get file extension from filename or mimeType (declare outside try block for logging)
    let extension: string | null = null
    if (fileName) {
      const lastDot = fileName.lastIndexOf('.')
      if (lastDot !== -1) {
        extension = fileName.slice(lastDot + 1).toLowerCase()
      }
    }

    // For binary files (PDF, DOCX, etc.), try to use file parsers with dynamic import
    // Use a runtime string to prevent Next.js from statically analyzing
    const fileParsersModulePath = '@' + '/lib/file-parsers'
    try {
      const fileParsersModule = await import(fileParsersModulePath)

      if (!extension) {
        try {
          const fileUtilsPath = '@' + '/lib/uploads/utils/file-utils'
          const fileUtilsModule = await import(fileUtilsPath)
          extension = fileUtilsModule.getExtensionFromMimeType(mimeType) || null
        } catch (error) {
          logger.warn('Failed to import getExtensionFromMimeType', { error })
        }
      }

      if (extension && fileParsersModule.isSupportedFileType(extension)) {
        logger.info('Parsing file with specialized parser', {
          fileId,
          extension,
          mimeType,
        })
        const parseResult = await fileParsersModule.parseBuffer(buffer, extension)
        return {
          content: parseResult.content,
          extractionMethod: `file-parser-${extension}`,
        }
      }
    } catch (parseError) {
      logger.warn('File parser not available or failed', {
        fileId,
        mimeType,
        error: parseError,
      })
    }

    // If we can't parse it, return null (don't include binary data)
    logger.warn('Unable to extract text content from file', {
      fileId,
      mimeType,
      extension,
      fileName,
    })
    return null
  } catch (error) {
    logger.warn('Error extracting file content', {
      fileId,
      mimeType,
      fileName,
      error,
    })
    return null
  }
}

/**
 * Builds a Google Drive query string from parsed prompt components
 *
 * COMMENTED OUT: Replaced with AI-based query generation using Claude
 */
// function buildDriveQuery(prompt: string, folderId?: string | null): string {
//   const parts: string[] = ['trashed=false']

//   // Add MIME type filters
//   const mimes = detectMimeTypes(prompt)
//   if (mimes.length > 0) {
//     const mimeExpr = mimes.map((m) => `mimeType='${m}'`).join(' or ')
//     parts.push(`(${mimeExpr})`)
//   }

//   // Add time window filters
//   const [startIso, endIso] = parseTimeWindow(prompt)
//   if (startIso && endIso) {
//     parts.push(`modifiedTime >= '${startIso}'`)
//     parts.push(`modifiedTime <= '${endIso}'`)
//   }

//   // Add folder filter
//   if (folderId) {
//     parts.push(`'${folderId}' in parents`)
//   }

//   // Add keyword filters (name and fullText search)
//   // Use OR logic between keywords to be less restrictive
//   // Files matching any of the keywords will be returned
//   const keywords = extractKeywords(prompt)
//   if (keywords.length > 0) {
//     const keywordConditions = keywords.map((kw) => {
//       const safe = kw.replace(/'/g, "\\'")
//       return `(name contains '${safe}' or fullText contains '${safe}')`
//     })
//     // Use OR logic: file must match at least one keyword
//     // This is less restrictive than AND logic which requires all keywords
//     parts.push(`(${keywordConditions.join(' and ')})`)
//   }

//   return parts.join(' and ')
// }

export const searchTool: ToolConfig<GoogleDriveSearchParams, GoogleDriveSearchResponse> = {
  id: 'google_drive_search',
  name: 'Search Google Drive Files',
  description:
    'Search Google Drive files using natural language prompts. Supports time windows, file types, folder filters, and keyword search.',
  version: '1.0',

  oauth: {
    required: true,
    provider: 'google-drive',
    // Need metadata.readonly scope for fullText search
    requiredScopes: [
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
    ],
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Drive API',
    },
    prompt: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Natural language search prompt (e.g., "find PDF invoices last month", "search slides Q4 strategy in folder Marketing")',
    },
    folderId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional folder ID to scope search to (only files in this folder).',
    },
    pageSize: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'The maximum number of files to return (default: 20, max: 1000)',
    },
    pageToken: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'The page token to use for pagination',
    },
  },

  // Request config is required but not used when directExecution is provided
  request: {
    url: '/api/tools/google_drive/search',
    method: 'GET',
    headers: () => ({}),
  },

  directExecution: async (params: GoogleDriveSearchParams) => {
    const { prompt, accessToken, folderId: paramFolderId, pageSize, pageToken } = params

    let folderId: string | null = null

    if (paramFolderId?.trim()) {
      folderId = paramFolderId.trim()
      logger.info('Using folder from params', { folderId })
    } else {
      const folderName = extractFolderName(prompt)
      if (folderName) {
        folderId = await resolveFolderIdByName(accessToken, folderName, pageSize?.toString() || '5')
        if (folderId) {
          logger.info('Resolved folder by name', { folderName, folderId })
        } else {
          logger.warn('Could not resolve folder by name', { folderName })
        }
      }
    }

    let query = await buildDriveQueryWithAI(prompt, folderId)

    if (folderId) {
      const safeFolderId = folderId.replace(/'/g, "\\'")
      const folderConstraint = `'${safeFolderId}' in parents`
      if (!query.includes(' in parents')) {
        query = `${query.trim()} and ${folderConstraint}`
      } else {
        query = query.replace(/'[^']*' in parents/g, folderConstraint)
      }
      logger.info('Enforced folder scope for search', { folderId })
    }

    logger.info('Built Drive query from prompt', { prompt, query, folderId })

    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.append('q', query)
    url.searchParams.append(
      'fields',
      'files(id,name,mimeType,modifiedTime,createdTime,webViewLink,webContentLink,size,owners(displayName,emailAddress),parents,driveId)'
    )
    url.searchParams.append('orderBy', 'modifiedTime desc')
    url.searchParams.append('includeItemsFromAllDrives', 'true')
    url.searchParams.append('supportsAllDrives', 'true')

    if (pageSize) {
      url.searchParams.append('pageSize', Math.min(Number(pageSize), 1000).toString())
    } else {
      url.searchParams.append('pageSize', '20')
    }

    if (pageToken) {
      url.searchParams.append('pageToken', pageToken)
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        logger.error('Failed to search Google Drive files', {
          error: data.error?.message || data.error,
          prompt,
        })
        throw new Error(data.error?.message || 'Failed to search Google Drive files')
      }

      // Map files to response format with metadata
      const filePromises = (data.files || []).map(async (file: any) => {
        const mimeType = file.mimeType || ''

        // Build file object with metadata
        const fileObj: any = {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          modifiedTime: file.modifiedTime,
          createdTime: file.createdTime,
          owners: file.owners || [],
          driveId: file.driveId,
        }

        // For non-folder files, include size and webContentLink
        if (mimeType !== 'application/vnd.google-apps.folder') {
          if (file.size) {
            fileObj.size = file.size
          }
          if (file.webContentLink) {
            fileObj.webContentLink = file.webContentLink
          }
        }

        // For folders, include parents
        if (mimeType === 'application/vnd.google-apps.folder' && file.parents) {
          fileObj.parents = file.parents
        }

        // Add file type classification
        if (mimeType.startsWith('application/vnd.google-apps.')) {
          fileObj.isGoogleWorkspaceFile = true
          if (mimeType === 'application/vnd.google-apps.document') {
            fileObj.fileType = 'Google Doc'
          } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
            fileObj.fileType = 'Google Sheet'
          } else if (mimeType === 'application/vnd.google-apps.presentation') {
            fileObj.fileType = 'Google Slides'
          } else if (mimeType === 'application/vnd.google-apps.folder') {
            fileObj.fileType = 'Folder'
          }
        } else if (mimeType === 'application/pdf') {
          fileObj.fileType = 'PDF'
        } else if (mimeType.startsWith('image/')) {
          fileObj.fileType = 'Image'
        } else if (mimeType.startsWith('video/')) {
          fileObj.fileType = 'Video'
        } else if (mimeType.startsWith('audio/')) {
          fileObj.fileType = 'Audio'
        }

        // Extract content from the file (for files with webViewLink)
        // Content is extracted using the file ID via Google Drive API
        if (file.webViewLink && file.id) {
          const contentResult = await extractFileContent(
            file.id,
            mimeType,
            file.name || '',
            accessToken
          )
          if (contentResult) {
            fileObj.content = contentResult.content
            fileObj.extractionMethod = contentResult.extractionMethod
            fileObj.contentSource = 'webViewLink'
          }
        }

        return fileObj
      })

      let files = await Promise.all(filePromises)

      // For each file with content, split into passages and rerank to extract relevant content
      const filesWithContent = files.filter(
        (file) => file.content && file.content.trim().length > 0
      )

      if (filesWithContent.length > 0) {
        // Process each file individually to extract relevant passages
        const processedFiles = await Promise.all(
          filesWithContent.map(async (file) => {
            try {
              // Split content into passages using TextChunker
              const passages = await splitContentIntoPassages(file.content || '', 1000, 100)

              if (passages.length === 0) {
                return file
              }

              // Wrap passages in objects for reranking
              const passageObjects = passages.map((passage) => ({ text: passage }))

              // Rerank passages for this file
              const rerankedPassageObjects = await rerankContent<{ text: string }>(
                prompt,
                passageObjects,
                (item) => item.text,
                {
                  enabled: true,
                  topN: Math.min(passages.length, 10), // Get top 10 most relevant passages per file
                  // maxContentLength: 4000,
                }
              )

              // Extract text from reranked passage objects
              file.relevantContent = rerankedPassageObjects.map((item) => item.text)
              file.content = ''
              return file
            } catch (error) {
              logger.warn('Failed to extract relevant content from file', {
                fileId: file.id,
                fileName: file.name,
                error: error instanceof Error ? error.message : 'Unknown error',
              })
              // Return file without relevantContent if reranking fails
              return file
            }
          })
        )

        // Replace files with processed versions
        files = files.map((file) => {
          const processed = processedFiles.find((pf) => pf.id === file.id)
          return processed || file
        })
      }

      return {
        success: true,
        output: {
          files,
        },
      }
    } catch (error) {
      logger.error('Error executing Google Drive search', { error, prompt })
      throw error
    }
  },

  outputs: {
    files: {
      type: 'json',
      description:
        'Array of file metadata objects matching the search prompt. Each file includes webViewLink, webContentLink, mimeType-specific details, file type information, and parsed content when available.',
    },
  },
}

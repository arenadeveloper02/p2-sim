import type { GoogleDocsReadResponse, GoogleDocsToolParams } from '@/tools/google_docs/types'
import { extractTextFromDocument } from '@/tools/google_docs/utils'
import type { ToolConfig } from '@/tools/types'

export const readTool: ToolConfig<GoogleDocsToolParams, GoogleDocsReadResponse> = {
  id: 'google_docs_read',
  name: 'Read Google Docs Document',
  description:
    'Read content from a Google Docs document. Automatically handles both native Google Docs and other document formats (like .docx files) by falling back to Google Drive API when needed.',
  version: '1.0',

  oauth: {
    required: true,
    provider: 'google-docs',
    additionalScopes: ['https://www.googleapis.com/auth/drive'],
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Docs API',
    },
    documentId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The ID of the document to read',
    },
  },

  request: {
    url: (params) => {
      // Ensure documentId is valid
      const documentId = params.documentId?.trim() || params.manualDocumentId?.trim()
      if (!documentId) {
        throw new Error('Document ID is required')
      }

      return `https://docs.googleapis.com/v1/documents/${documentId}`
    },
    method: 'GET',
    headers: (params) => {
      // Validate access token
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }

      return {
        Authorization: `Bearer ${params.accessToken}`,
      }
    },
  },

  transformResponse: async (response: Response, params?: GoogleDocsToolParams) => {
    const resolvedDocumentId =
      params?.documentId?.trim() || params?.manualDocumentId?.trim() || undefined

    // Check if the response is successful
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // Handle the specific case where the document is not in native Google Docs format
      if (
        response.status === 400 &&
        errorData.error?.message === 'This operation is not supported for this document'
      ) {
        // Fall back to Google Drive API to get the file content
        try {
          const { executeTool } = await import('@/tools')
          const driveResult = await executeTool('google_drive_get_content', {
            accessToken: params?.accessToken,
            fileId: resolvedDocumentId,
          })

          if (driveResult.success) {
            return {
              success: true,
              output: {
                content: driveResult.output?.content || '',
                metadata: {
                  documentId: resolvedDocumentId ?? '',
                  title: driveResult.output?.metadata?.name || 'Untitled Document',
                  mimeType:
                    driveResult.output?.metadata?.mimeType ||
                    'application/vnd.google-apps.document',
                  url: `https://docs.google.com/document/d/${resolvedDocumentId}/edit`,
                  isExported: true, // Indicate this was exported from Drive API
                },
              },
            }
          }
        } catch (fallbackError) {
          // If fallback also fails, return the original error
          console.warn('Fallback to Google Drive API failed:', fallbackError)
        }
      }

      // Return the original error if fallback failed or it's a different error
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    // Extract document content from the response
    let content = ''
    if (data.body?.content) {
      content = extractTextFromDocument(data)
    }

    // Create document metadata
    const metadata = {
      documentId: data.documentId,
      title: data.title || 'Untitled Document',
      mimeType: 'application/vnd.google-apps.document',
      url: `https://docs.google.com/document/d/${data.documentId}/edit`,
    }

    return {
      success: true,
      output: {
        content,
        metadata,
      },
    }
  },

  outputs: {
    content: { type: 'string', description: 'Extracted document text content' },
    metadata: { type: 'json', description: 'Document metadata including ID, title, and URL' },
  },
}

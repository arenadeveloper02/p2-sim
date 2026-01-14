import { convertMarkdownToGoogleDocsRequests } from '@/tools/google_docs/formatterUtil'
import type { GoogleDocsToolParams, GoogleDocsWriteResponse } from '@/tools/google_docs/types'
import type { ToolConfig } from '@/tools/types'

// Helper function to get the current document end index
async function getDocumentEndIndex(documentId: string, accessToken: string): Promise<number> {
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.statusText}`)
  }

  const document = await response.json()

  // The endIndex of the last content element is a structural boundary
  // We need to subtract 1 to get the last insertable position
  const content = document.body.content
  const lastElement = content[content.length - 1]

  return lastElement.endIndex - 1 // Changed this line
}

export const writeTool: ToolConfig<GoogleDocsToolParams, GoogleDocsWriteResponse> = {
  id: 'google_docs_write',
  name: 'Write to Google Docs Document',
  description: 'Write or update content in a Google Docs document',
  version: '1.0',
  oauth: {
    required: true,
    provider: 'google-docs',
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
      description: 'The ID of the document to write to',
    },
    content: {
      type: 'string',
      required: true,
      description: 'The content to write to the document',
    },
  },
  request: {
    url: (params) => {
      // Ensure documentId is valid
      const documentId = params.documentId?.trim() || params.manualDocumentId?.trim()
      if (!documentId) {
        throw new Error('Document ID is required')
      }

      return `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`
    },
    method: 'POST',
    headers: (params) => {
      // Validate access token
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }

      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    body: async (params) => {
      // Validate content
      if (!params.content) {
        throw new Error('Content is required')
      }

      // Validate access token and document ID
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }

      const documentId = params.documentId?.trim() || params.manualDocumentId?.trim()
      if (!documentId) {
        throw new Error('Document ID is required')
      }

      // Get the current end index of the document
      const endIndex = await getDocumentEndIndex(documentId, params.accessToken)

      // Generate requests starting from the end of the document
      const requests = convertMarkdownToGoogleDocsRequests(params.content, undefined, endIndex)

      const requestBody = {
        requests,
      }

      return requestBody
    },
  },

  outputs: {
    updatedContent: {
      type: 'boolean',
      description: 'Indicates if document content was updated successfully',
    },
    metadata: {
      type: 'json',
      description: 'Updated document metadata including ID, title, and URL',
      properties: {
        documentId: { type: 'string', description: 'Google Docs document ID' },
        title: { type: 'string', description: 'Document title' },
        mimeType: { type: 'string', description: 'Document MIME type' },
        url: { type: 'string', description: 'Document URL' },
      },
    },
  },

  transformResponse: async (response: Response) => {
    const responseText = await response.text()

    // Parse the response if it's not empty
    let _data = {}
    if (responseText.trim()) {
      _data = JSON.parse(responseText)
    }

    // Get the document ID from the URL
    const urlParts = response.url.split('/')
    let documentId = ''
    for (let i = 0; i < urlParts.length; i++) {
      if (urlParts[i] === 'documents' && i + 1 < urlParts.length) {
        documentId = urlParts[i + 1].split(':')[0]
        break
      }
    }

    // Create document metadata
    const metadata = {
      documentId,
      title: 'Updated Document',
      mimeType: 'application/vnd.google-apps.document',
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    }

    return {
      success: true,
      output: {
        updatedContent: true,
        metadata,
      },
    }
  },
}

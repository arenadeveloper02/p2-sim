import type { ToolConfig } from '@/tools/types'
import type { GetFileParams, GetFileResponse } from './types'

export const getFileTool: ToolConfig<GetFileParams, GetFileResponse> = {
  id: 'get_file',
  name: 'Get Figma File',
  description: 'Retrieve a Figma file and its contents',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key',
      required: true,
      visibility: 'user-or-llm',
    },
    version: {
      type: 'string',
      description: 'Specific version to retrieve (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    ids: {
      type: 'array',
      description: 'Specific node IDs to retrieve (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    depth: {
      type: 'number',
      description: 'Depth of the document tree to retrieve (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    geometry: {
      type: 'string',
      description: 'Geometry format (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    plugin_data: {
      type: 'string',
      description: 'Plugin data to include (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    branch_data: {
      type: 'boolean',
      description: 'Include branch data (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: (params) => {
      const queryParams = new URLSearchParams()
      if (params.version) queryParams.append('version', params.version)
      if (params.ids && params.ids.length > 0) queryParams.append('ids', params.ids.join(','))
      if (params.depth) queryParams.append('depth', params.depth.toString())
      if (params.geometry) queryParams.append('geometry', params.geometry)
      if (params.plugin_data) queryParams.append('plugin_data', params.plugin_data)
      if (params.branch_data !== undefined)
        queryParams.append('branch_data', params.branch_data.toString())

      return `https://api.figma.com/v1/files/${params.fileKey}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    },
    method: 'GET',
    headers: () => ({
      'X-Figma-Token':
        process.env.FIGMA_API_KEY || 'figd_91mOtrt2ow4q2OWvwsROQYPB74fwOa6Vact1JFroc',
    }),
  },
  transformResponse: async (response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Figma API error: ${response.status} ${response.statusText}. ${
          errorData.message || 'Unknown error'
        }`
      )
    }

    const data = await response.json()

    return {
      success: true,
      output: {
        content: `Successfully retrieved Figma file "${data.name}"`,
        metadata: {
          file: {
            key: data.key,
            name: data.name,
            lastModified: data.lastModified,
            thumbnailUrl: data.thumbnailUrl || '',
            version: data.version || '1',
            role: data.role || 'viewer',
            editorType: data.editorType || 'figma',
            linkAccess: data.linkAccess || 'private',
          },
          document: data.document || {},
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'File data and summary',
    },
    metadata: {
      type: 'object',
      description: 'File metadata',
      properties: {
        file: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'File key' },
            name: { type: 'string', description: 'File name' },
            lastModified: { type: 'string', description: 'Last modified timestamp' },
            thumbnailUrl: { type: 'string', description: 'Thumbnail URL' },
            version: { type: 'string', description: 'File version' },
            role: { type: 'string', description: 'User role' },
            editorType: { type: 'string', description: 'Editor type' },
            linkAccess: { type: 'string', description: 'Link access level' },
          },
        },
        document: {
          type: 'object',
          description: 'Document structure',
        },
      },
    },
  },
}

import type { ToolConfig } from '@/tools/types'
import type { GetProjectFilesParams, GetProjectFilesResponse } from './types'

export const getProjectFilesTool: ToolConfig<GetProjectFilesParams, GetProjectFilesResponse> = {
  id: 'get_project_files',
  name: 'Get Project Files',
  description: 'Retrieve files from a Figma project',
  version: '1.0.0',
  params: {
    projectId: {
      type: 'string',
      description: 'Figma project ID',
      required: true,
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
      if (params.branch_data !== undefined)
        queryParams.append('branch_data', params.branch_data.toString())

      return `https://api.figma.com/v1/projects/${params.projectId}/files${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
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
    const files = data.files || []

    return {
      success: true,
      output: {
        content: `Successfully retrieved ${files.length} files from project`,
        metadata: {
          files,
          projectId: data.project_id || '',
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Files data and summary',
    },
    metadata: {
      type: 'object',
      description: 'Files metadata',
      properties: {
        files: {
          type: 'array',
          description: 'Array of file objects',
          items: {
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
        },
        projectId: { type: 'string', description: 'Project ID' },
      },
    },
  },
}

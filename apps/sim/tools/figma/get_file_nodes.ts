import type { ToolConfig } from '@/tools/types'
import type { GetFileNodesParams, GetFileNodesResponse } from './types'

export const getFileNodesTool: ToolConfig<GetFileNodesParams, GetFileNodesResponse> = {
  id: 'get_file_nodes',
  name: 'Get Figma File Nodes',
  description: 'Retrieve specific nodes from a Figma file',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key',
      required: true,
      visibility: 'user-or-llm',
    },
    ids: {
      type: 'array',
      description: 'Node IDs to retrieve',
      required: true,
      visibility: 'user-or-llm',
    },
    version: {
      type: 'string',
      description: 'Specific version to retrieve (optional)',
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
  },
  request: {
    url: (params) => {
      const queryParams = new URLSearchParams()

      // Handle ids parameter - convert string to array if needed
      let idsArray: string[] = []
      if (Array.isArray(params.ids)) {
        idsArray = params.ids
      } else if (typeof params.ids === 'string' && params.ids.trim()) {
        idsArray = params.ids
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      }

      if (idsArray.length > 0) {
        queryParams.append('ids', idsArray.join(','))
      }

      if (params.version) queryParams.append('version', params.version)
      if (params.depth) queryParams.append('depth', params.depth.toString())
      if (params.geometry) queryParams.append('geometry', params.geometry)
      if (params.plugin_data) queryParams.append('plugin_data', params.plugin_data)

      return `https://api.figma.com/v1/files/${params.fileKey}/nodes?${queryParams.toString()}`
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
    const nodes = data.nodes || {}

    return {
      success: true,
      output: {
        content: `Successfully retrieved ${Object.keys(nodes).length} nodes from Figma file`,
        metadata: {
          nodes,
          fileKey: data.file_key || '',
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Nodes data and summary',
    },
    metadata: {
      type: 'object',
      description: 'Nodes metadata',
      properties: {
        nodes: {
          type: 'object',
          description: 'Object containing node data keyed by node ID',
        },
        fileKey: { type: 'string', description: 'File key' },
      },
    },
  },
}

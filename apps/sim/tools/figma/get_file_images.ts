import type { ToolConfig } from '@/tools/types'
import type { GetFileImagesParams, GetFileImagesResponse } from './types'

export const getFileImagesTool: ToolConfig<GetFileImagesParams, GetFileImagesResponse> = {
  id: 'get_file_images',
  name: 'Get Figma File Images',
  description: 'Export nodes from a Figma file as images',
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
      description: 'Node IDs to export as images',
      required: true,
      visibility: 'user-or-llm',
    },
    format: {
      type: 'string',
      description: 'Image format (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    scale: {
      type: 'number',
      description: 'Scale factor (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    svg_include_id: {
      type: 'boolean',
      description: 'Include ID in SVG (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    svg_simplify_stroke: {
      type: 'boolean',
      description: 'Simplify stroke in SVG (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    use_absolute_bounds: {
      type: 'boolean',
      description: 'Use absolute bounds (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
    version: {
      type: 'string',
      description: 'Specific version to retrieve (optional)',
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

      queryParams.append('format', params.format || 'png')
      queryParams.append('scale', (params.scale || 1).toString())
      queryParams.append('svg_include_id', (params.svg_include_id || false).toString())
      queryParams.append('svg_simplify_stroke', (params.svg_simplify_stroke || false).toString())
      queryParams.append('use_absolute_bounds', (params.use_absolute_bounds || false).toString())
      if (params.version) queryParams.append('version', params.version)

      return `https://api.figma.com/v1/images/${params.fileKey}?${queryParams.toString()}`
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
    const images = data.images || {}

    return {
      success: true,
      output: {
        content: `Successfully exported ${Object.keys(images).length} images from Figma file`,
        metadata: {
          images,
          fileKey: data.file_key || '',
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Images data and summary',
    },
    metadata: {
      type: 'object',
      description: 'Images metadata',
      properties: {
        images: {
          type: 'object',
          description: 'Object containing image data keyed by node ID',
        },
        fileKey: { type: 'string', description: 'File key' },
      },
    },
  },
}

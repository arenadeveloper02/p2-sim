import type { IconLibrary } from '@/tools/google_slides/templates/schema'
import { getPresentationIconLibrary } from '@/tools/google_slides/templates'
import type { ToolConfig } from '@/tools/types'

interface GetPresentationIconsParams {
  category?: string
}

interface GetPresentationIconsResponse {
  success: boolean
  output: {
    version: string
    baseUrl: string
    icons: IconLibrary['icons']
    count: number
  }
}

export const getPresentationIconsTool: ToolConfig<
  GetPresentationIconsParams,
  GetPresentationIconsResponse
> = {
  id: 'google_slides_get_presentation_icons',
  name: 'Get Presentation Icons',
  description:
    'Return the presentation icon catalog (ids, labels, categories, tags, and image URLs) for template slides',
  version: '1.0',

  params: {
    category: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional category filter (e.g. marketing, technology, ai)',
    },
  },

  request: {
    url: '/api/tools/google_slides/get_presentation_icons',
    method: 'GET',
    headers: () => ({}),
  },

  directExecution: async (
    params: GetPresentationIconsParams
  ): Promise<GetPresentationIconsResponse> => {
    const library = getPresentationIconLibrary()
    const categoryFilter = params.category?.trim().toLowerCase()

    const icons = categoryFilter
      ? library.icons.filter((icon) => icon.category.toLowerCase() === categoryFilter)
      : library.icons

    return {
      success: true,
      output: {
        version: library.version,
        baseUrl: library.baseUrl,
        icons,
        count: icons.length,
      },
    }
  },

  outputs: {
    version: { type: 'string', description: 'Icon library version' },
    baseUrl: { type: 'string', description: 'Base URL for icon assets' },
    icons: {
      type: 'json',
      description: 'Icon entries (id, label, category, tags, pngUrl, optional svgUrl)',
    },
    count: { type: 'number', description: 'Number of icons returned' },
  },
}

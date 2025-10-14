import type { ToolConfig } from '@/tools/types'
import type { GetTeamProjectsParams, GetTeamProjectsResponse } from './types'

export const getTeamProjectsTool: ToolConfig<GetTeamProjectsParams, GetTeamProjectsResponse> = {
  id: 'get_team_projects',
  name: 'Get Team Projects',
  description: 'Retrieve projects from a Figma team',
  version: '1.0.0',
  params: {
    teamId: {
      type: 'string',
      description: 'Figma team ID',
      required: true,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: (params) => `https://api.figma.com/v1/teams/${params.teamId}/projects`,
    method: 'GET',
    headers: () => ({
      'X-Figma-Token': process.env.FIGMA_API_KEY || '',
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
    const projects = data.projects || []

    return {
      success: true,
      output: {
        content: `Retrieved ${projects.length} projects from team`,
        metadata: {
          projects,
          teamId: data.team_id || '',
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Projects data and summary',
    },
    metadata: {
      type: 'object',
      description: 'Projects metadata',
      properties: {
        projects: {
          type: 'array',
          description: 'Array of project objects',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Project ID' },
              name: { type: 'string', description: 'Project name' },
              created_at: { type: 'string', description: 'Creation timestamp' },
              modified_at: { type: 'string', description: 'Last modified timestamp' },
              thumbnail_url: { type: 'string', description: 'Thumbnail URL' },
            },
          },
        },
        teamId: { type: 'string', description: 'Team ID' },
      },
    },
  },
}

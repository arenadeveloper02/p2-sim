import { getTemplateMasterSchema } from '@/tools/google_slides/templates'
import type { ToolConfig } from '@/tools/types'

interface GetTemplateSchemaParams {
  template: string
}

interface GetTemplateSchemaResponse {
  success: boolean
  output: {
    schema: Record<string, unknown>
  }
}

export const getTemplateSchemaTool: ToolConfig<GetTemplateSchemaParams, GetTemplateSchemaResponse> =
  {
    id: 'p2_docs_get_template_schema',
    name: 'Get Template Schema',
    description: 'Return the JSON schema for a presentation template (e.g. position2_2026)',
    version: '1.0',

    params: {
      template: {
        type: 'string',
        required: true,
        visibility: 'user-or-llm',
        description: 'Template id (e.g. position2_2026). Use TEMPLATE_OPTIONS for dropdown values.',
      },
    },

    request: {
      url: '/api/tools/p2_docs/get_template_schema',
      method: 'GET',
      headers: () => ({}),
    },

    directExecution: async (
      params: GetTemplateSchemaParams
    ): Promise<GetTemplateSchemaResponse> => {
      const schema = getTemplateMasterSchema(params.template.trim())
      return {
        success: true,
        output: {
          schema: schema as unknown as Record<string, unknown>,
        },
      }
    },

    outputs: {
      schema: {
        type: 'json',
        description: 'Full presentation template schema (slides, blocks, shapeIds, etc.)',
      },
    },
  }

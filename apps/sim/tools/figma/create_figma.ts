import type { ToolConfig } from '@/tools/types'
import type { CreateFigmaParams, CreateFigmaResponse } from './types'

export const createFigmaTool: ToolConfig<CreateFigmaParams, CreateFigmaResponse> = {
  id: 'figma_create',
  name: 'Generate Figma Design with AI',
  description: 'Generate AI-powered Figma designs automatically using Claude AI and browser automation',
  version: '1.0.0',
  params: {
    name: {
      type: 'string',
      description: 'Name of the Figma file to create',
      required: true,
      visibility: 'user-or-llm',
    },
    description: {
      type: 'string',
      description: 'Optional description for the file',
      required: false,
      visibility: 'user-or-llm',
    },
    designPrompt: {
      type: 'string',
      description: 'AI prompt to generate design content',
      required: true,
      visibility: 'user-or-llm',
    },
    projectId: {
      type: 'string',
      description: 'Figma project ID to create the file in',
      required: true,
      visibility: 'user-or-llm',
    },
    brandGuidelines: {
      type: 'file',
      description: 'Optional brand guidelines file (PDF, image, or text) to inform the design',
      required: false,
      visibility: 'user-or-llm',
    },
    wireframes: {
      type: 'file',
      description: 'Optional wireframes file to guide the design structure',
      required: false,
      visibility: 'user-or-llm',
    },
    additionalData: {
      type: 'file',
      description: 'Optional additional data or reference files',
      required: false,
      visibility: 'user-or-llm',
    },
    additionalInfo: {
      type: 'string',
      description: 'Additional text information to guide the design generation',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: '/api/figma/generate-design-json',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: CreateFigmaParams) => {
      if (!params?.designPrompt || !params?.projectId || !params?.name) {
        throw new Error('Missing required parameters: designPrompt, projectId, and name are required')
      }

      // For internal API calls, send file paths/URLs as JSON, not FormData
      const body: Record<string, any> = {
        projectId: params.projectId,
        fileName: params.name,
        prompt: params.designPrompt,
      }

      if (params.additionalInfo) {
        body.additionalInfo = params.additionalInfo
      }

      // Handle file parameters - extract path or URL from file objects
      if (params.brandGuidelines) {
        body.brandGuidelinesFile = (params.brandGuidelines as any).path || (params.brandGuidelines as any).url
      }

      if (params.wireframes) {
        body.wireframesFile = (params.wireframes as any).path || (params.wireframes as any).url
      }

      if (params.additionalData) {
        body.additionalDataFile = (params.additionalData as any).path || (params.additionalData as any).url
      }

      return body
    },
  },

  transformResponse: async (response: Response): Promise<CreateFigmaResponse> => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to generate Figma design: ${response.statusText}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Failed to generate Figma design')
    }

    // Get Figma user info for metadata
    let userData = { id: 'unknown', email: 'unknown' }
    try {
      const userResponse = await fetch('https://api.figma.com/v1/me', {
        method: 'GET',
        headers: {
          'X-Figma-Token': process.env.FIGMA_API_KEY || '',
        },
      })
      if (userResponse.ok) {
        userData = await userResponse.json()
      }
    } catch (error) {
      // Continue with default values if Figma API call fails
    }

    return {
      success: true,
      output: {
        content: `Successfully generated Figma design and created the file in Figma. ${result.figmaFileUrl ? `View it at: ${result.figmaFileUrl}` : ''}`,
        metadata: {
          key: result.figmaFileUrl || '',
          name: result.fileName || 'Generated Design',
          lastModified: new Date().toISOString(),
          thumbnailUrl: '',
          version: '1',
          role: 'owner',
          editorType: 'figma',
          linkAccess: 'private',
          designPrompt: result.prompt || '',
          projectId: result.projectId || '',
          userId: userData.id,
          userEmail: userData.email,
          figmaFileUrl: result.figmaFileUrl,
          renderedData: result.renderedData,
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Success message with Figma file URL',
    },
    metadata: {
      type: 'object',
      description: 'File metadata including key, name, and generated content',
      properties: {
        key: { type: 'string', description: 'Figma file URL' },
        name: { type: 'string', description: 'File name' },
        lastModified: { type: 'string', description: 'Last modified timestamp' },
        thumbnailUrl: { type: 'string', description: 'Thumbnail URL' },
        version: { type: 'string', description: 'File version' },
        role: { type: 'string', description: 'User role in the file' },
        editorType: { type: 'string', description: 'Editor type' },
        linkAccess: { type: 'string', description: 'Link access level' },
        designPrompt: { type: 'string', description: 'Design prompt used' },
        projectId: { type: 'string', description: 'Project ID' },
        userId: { type: 'string', description: 'Figma user ID' },
        userEmail: { type: 'string', description: 'Figma user email' },
        figmaFileUrl: { type: 'string', description: 'URL to the created Figma file' },
        renderedData: { type: 'string', description: 'Generated HTML/CSS code' },
      },
    },
  },
}

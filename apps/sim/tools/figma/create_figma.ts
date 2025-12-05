import type { ToolConfig } from '@/tools/types'
import type { CreateFigmaParams, CreateFigmaResponse } from './types'

export const createFigmaTool: ToolConfig<CreateFigmaParams, CreateFigmaResponse> = {
  id: 'figma_create',
  name: 'Generate Figma Design with AI',
  description:
    'Generate AI-powered Figma designs automatically using Claude AI and browser automation',
  version: '1.0.0',
  params: {
    // name: {
    //   type: 'string',
    //   description: 'Name of the Figma file to create',
    //   required: true,
    //   visibility: 'user-or-llm',
    // },
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
    designTargets: {
      type: 'array',
      description: 'Device/layout experiences (desktop, mobile, etc.) to generate simultaneously',
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
      if (!params?.designPrompt || !params?.projectId) {
        throw new Error(
          'Missing required parameters: designPrompt, projectId, and name are required'
        )
      }

      // For internal API calls, send file paths/URLs as JSON, not FormData
      const body: Record<string, any> = {
        projectId: params.projectId,
        fileName: params.name || 'Generated Design',
        prompt: params.designPrompt,
      }

      if (params.additionalInfo) {
        body.additionalInfo = params.additionalInfo
      }

      // Handle file parameters - extract path or URL from file objects
      if (params.brandGuidelines) {
        body.brandGuidelinesFile =
          (params.brandGuidelines as any).path || (params.brandGuidelines as any).url
      }

      if (params.wireframes) {
        body.wireframesFile = (params.wireframes as any).path || (params.wireframes as any).url
      }

      if (params.additionalData) {
        body.additionalDataFile =
          (params.additionalData as any).path || (params.additionalData as any).url
      }

      body.description = params.description

      // Handle designTargets - convert from comma-separated string to array if needed
      if (params.designTargets) {
        if (typeof params.designTargets === 'string') {
          // Parse comma-separated string
          const targets = params.designTargets
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
          if (targets.length > 0) {
            body.designTargets = targets
          }
        } else if (Array.isArray(params.designTargets) && params.designTargets.length > 0) {
          body.designTargets = params.designTargets
        }
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

    // Handle multiple file URLs (multiple targets) or single file URL
    const hasMultipleFiles = result.figmaFileUrls && Array.isArray(result.figmaFileUrls)
    const primaryFileUrl =
      result.figmaFileUrl || (hasMultipleFiles ? result.figmaFileUrls[0]?.url : '')
    const designTargets = result.designTargets || []

    let contentMessage = 'Successfully generated Figma design'
    if (hasMultipleFiles && result.figmaFileUrls.length > 1) {
      const fileList = result.figmaFileUrls
        .map((file: { target: string; url: string }) => {
          const targetLabel = file.target.charAt(0).toUpperCase() + file.target.slice(1)
          return `${targetLabel}: ${file.url}`
        })
        .join('\n')
      contentMessage = `Successfully generated ${result.figmaFileUrls.length} separate Figma designs:\n${fileList}`
    } else if (primaryFileUrl) {
      contentMessage += ` and created the file in Figma. View it at: ${primaryFileUrl}`
    }

    if (result.renderedTargets && result.renderedTargets.length > 1) {
      const labels = result.renderedTargets
        .map((target: { label: string }) => target.label)
        .join(', ')
      contentMessage += ` Included target experiences: ${labels}.`
    }

    return {
      success: true,
      output: {
        content: contentMessage,
        metadata: {
          key: primaryFileUrl || '',
          name: result.fileName || 'Generated Design',
          lastModified: new Date().toISOString(),
          thumbnailUrl: '',
          version: '1',
          role: 'owner',
          editorType: 'figma',
          linkAccess: 'private',
          designPrompt: result.prompt || '',
          projectId: result.projectId || '',
          figmaFileUrl: primaryFileUrl,
          figmaFileUrls: hasMultipleFiles ? result.figmaFileUrls : undefined,
          renderedData: result.renderedData,
          designTargets: designTargets,
          renderedTargets: result.renderedTargets,
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
        figmaFileUrl: { type: 'string', description: 'URL to the created Figma file' },
        renderedData: { type: 'string', description: 'Generated HTML/CSS code' },
      },
    },
  },
}

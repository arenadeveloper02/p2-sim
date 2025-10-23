import { type NextRequest, NextResponse } from 'next/server'
import { generateFigmaDesign } from '@/lib/figma-design-generator'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for design generation

/**
 * POST /api/figma/generate-design-json
 *
 * Generate a Figma design using AI and automation (JSON API for internal tool calls)
 *
 * Request body (application/json):
 * - projectId: string (required)
 * - fileName: string (required)
 * - prompt: string (required)
 * - brandGuidelinesFile: string (optional) - file path
 * - wireframesFile: string (optional) - file path
 * - additionalDataFile: string (optional) - file path
 * - additionalInfo: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Extract required fields
    const projectId = body.projectId as string
    const fileName = body.fileName as string
    const prompt = body.prompt as string

    // Validate required fields
    if (!projectId || !fileName || !prompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: projectId, fileName, and prompt are required',
        },
        { status: 400 }
      )
    }

    // Extract optional file paths
    const brandGuidelinesFile = body.brandGuidelinesFile as string | undefined
    const wireframesFile = body.wireframesFile as string | undefined
    const additionalDataFile = body.additionalDataFile as string | undefined
    const additionalInfo = body.additionalInfo as string | undefined
    const description = body.description as string | undefined
    // Generate the design
    const result = await generateFigmaDesign({
      projectId,
      fileName,
      prompt,
      brandGuidelinesFile,
      wireframesFile,
      additionalDataFile,
      additionalInfo,
      description,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in generate-design-json API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/figma/generate-design-json
 *
 * Get API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/figma/generate-design-json',
    method: 'POST',
    description: 'Generate a Figma design using AI and automation (JSON API)',
    contentType: 'application/json',
    requiredFields: {
      projectId: 'string - Figma project ID',
      fileName: 'string - Name for the new Figma file',
      prompt: 'string - Design prompt for AI generation',
    },
    optionalFields: {
      brandGuidelinesFile: 'string - Path to brand guidelines file',
      wireframesFile: 'string - Path to wireframes file',
      additionalDataFile: 'string - Path to additional data file',
      additionalInfo: 'string - Additional information as text',
    },
    response: {
      success: 'boolean',
      renderedData: 'string - Generated HTML/CSS (if successful)',
      figmaFileUrl: 'string - URL to the created Figma file (if successful)',
      error: 'string - Error message (if failed)',
    },
  })
}

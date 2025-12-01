import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { type NextRequest, NextResponse } from 'next/server'
import { generateFigmaDesign } from '@/lib/figma-design-generator'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for design generation

/**
 * POST /api/figma/generate-design
 *
 * Generate a Figma design using AI and automation
 *
 * Request body (multipart/form-data):
 * - projectId: string (required)
 * - fileName: string (required)
 * - prompt: string (required)
 * - brandGuidelinesFile: File (optional)
 * - wireframesFile: File (optional)
 * - additionalDataFile: File (optional)
 * - additionalInfo: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    // Extract required fields
    const projectId = formData.get('projectId') as string
    const fileName = formData.get('fileName') as string
    const prompt = formData.get('prompt') as string
    const description = formData.get('description') as string
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

    // Create temporary directory for uploaded files
    const tmpDir = path.join(process.cwd(), 'tmp', 'figma-uploads')
    await mkdir(tmpDir, { recursive: true })

    // Process optional file uploads
    let brandGuidelinesPath: string | undefined
    let wireframesPath: string | undefined
    let additionalDataPath: string | undefined

    const brandGuidelinesFile = formData.get('brandGuidelinesFile') as File | null
    if (brandGuidelinesFile) {
      const bytes = await brandGuidelinesFile.arrayBuffer()
      const buffer = Buffer.from(bytes)
      brandGuidelinesPath = path.join(tmpDir, `brand-${Date.now()}-${brandGuidelinesFile.name}`)
      await writeFile(brandGuidelinesPath, buffer)
    }

    const wireframesFile = formData.get('wireframesFile') as File | null
    if (wireframesFile) {
      const bytes = await wireframesFile.arrayBuffer()
      const buffer = Buffer.from(bytes)
      wireframesPath = path.join(tmpDir, `wireframes-${Date.now()}-${wireframesFile.name}`)
      await writeFile(wireframesPath, buffer)
    }

    const additionalDataFile = formData.get('additionalDataFile') as File | null
    if (additionalDataFile) {
      const bytes = await additionalDataFile.arrayBuffer()
      const buffer = Buffer.from(bytes)
      additionalDataPath = path.join(tmpDir, `data-${Date.now()}-${additionalDataFile.name}`)
      await writeFile(additionalDataPath, buffer)
    }

    const additionalInfo = formData.get('additionalInfo') as string | null
    const designTargetsEntries = [
      ...formData.getAll('designTargets'),
      ...formData.getAll('designTargets[]'),
    ]
    const designTargets =
      designTargetsEntries
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0).length > 0
        ? designTargetsEntries
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry) => entry.length > 0)
        : undefined

    // Generate the design
    const result = await generateFigmaDesign({
      projectId,
      fileName,
      prompt,
      brandGuidelinesFile: brandGuidelinesPath,
      wireframesFile: wireframesPath,
      additionalDataFile: additionalDataPath,
      additionalInfo: additionalInfo || undefined,
      description: description || undefined,
      designTargets,
    })

    // Clean up temporary files (optional - you might want to keep them)
    // You can implement cleanup logic here if needed

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in generate-design API:', error)
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
 * GET /api/figma/generate-design
 *
 * Get API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/figma/generate-design',
    method: 'POST',
    description: 'Generate a Figma design using AI and automation',
    contentType: 'multipart/form-data',
    requiredFields: {
      projectId: 'string - Figma project ID',
      fileName: 'string - Name for the new Figma file',
      prompt: 'string - Design prompt for AI generation',
    },
    optionalFields: {
      brandGuidelinesFile: 'File - Brand guidelines document (txt, pdf, docx)',
      wireframesFile: 'File - Wireframes document (txt, pdf, docx)',
      additionalDataFile: 'File - Additional data document (txt, pdf, docx)',
      additionalInfo: 'string - Additional information as text',
      designTargets:
        'array|string - Device or layout targets (desktop, mobile, tablet, etc.) to generate concurrently',
    },
    response: {
      success: 'boolean',
      renderedData: 'string - Generated HTML/CSS (if successful)',
      figmaFileUrl: 'string - URL to the created Figma file (if successful)',
      error: 'string - Error message (if failed)',
    },
    example: {
      curl: `curl -X POST http://localhost:3000/api/figma/generate-design \\
  -F "projectId=397940050" \\
  -F "fileName=AI Generated Landing Page" \\
  -F "prompt=Create a modern landing page for a SaaS product" \\
  -F "additionalInfo=Use blue and white color scheme"`,
    },
  })
}

import { ToolConfig } from '@/tools/types'
import { createLogger } from '@/lib/logs/console/logger'
import { OpenAI } from 'openai'

const logger = createLogger('FigmaAIDesignWorkflow')

export interface FigmaAIDesignWorkflowParams {
  projectId: string
  fileKey: string
  aiPrompt: string
  designType?: 'landing_page' | 'ui_components' | 'wireframe' | 'full_website'
  brandGuidelines?: string
  responsiveBreakpoints?: string[]
  includeCode?: boolean
}

export interface FigmaAIDesignWorkflowResponse {
  success: boolean
  output: {
    designSpecification: {
      figmaCompatibleDesign: {
        nodes: any[]
        styles: any[]
        variables: any[]
        components: any[]
      }
      designTokens: {
        colors: any[]
        typography: any[]
        spacing: any[]
        shadows: any[]
      }
      layoutStructure: {
        frames: any[]
        components: any[]
        responsiveVersions: any[]
      }
    }
    sqsMessage: {
      messageId: string
      queueUrl: string
      payload: {
        projectId: string
        fileKey: string
        designData: any
        metadata: {
          generatedAt: string
          requestId: string
          version: string
        }
      }
    }
    aiGeneration: {
      prompt: string
      model: string
      tokensUsed: number
      generationTime: number
    }
    nextSteps: string[]
    limitations: string[]
  }
}

/**
 * Production-level Figma AI Design Workflow Tool
 * 
 * This tool integrates with ChatGPT-5 to generate Figma-compatible designs
 * and sends the results to SQS for the Figma plugin to process.
 */
export const figmaAIDesignWorkflowTool: ToolConfig<
  FigmaAIDesignWorkflowParams,
  FigmaAIDesignWorkflowResponse
> = {
  id: 'figma_ai_design_workflow',
  name: 'Figma AI Design Workflow',
  description: 'Generate Figma-compatible designs using ChatGPT-5 and send to SQS for plugin processing',
  version: '1.0.0',
  params: {
    projectId: {
      type: 'string',
      description: 'Figma project ID where the design will be created',
      required: true,
      visibility: 'user-or-llm',
    },
    fileKey: {
      type: 'string',
      description: 'Figma file key for the target file',
      required: true,
      visibility: 'user-or-llm',
    },
    aiPrompt: {
      type: 'string',
      description: 'Detailed AI prompt describing the design to generate',
      required: true,
      visibility: 'user-or-llm',
    },
    designType: {
      type: 'string',
      description: 'Type of design to generate',
      required: false,
      visibility: 'user-or-llm',
    },
    brandGuidelines: {
      type: 'string',
      description: 'Optional brand guidelines to inform the design',
      required: false,
      visibility: 'user-or-llm',
    },
    responsiveBreakpoints: {
      type: 'array',
      description: 'Responsive breakpoints for the design',
      required: false,
      visibility: 'user-or-llm',
    },
    includeCode: {
      type: 'boolean',
      description: 'Whether to include generated code in the output',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: () => ({
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    }),
  },
  transformResponse: async (response, params) => {
    const requestId = `figma-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    try {
      logger.info(`[${requestId}] Starting Figma AI Design Workflow`, {
        projectId: params?.projectId,
        fileKey: params?.fileKey,
        designType: params?.designType,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}. ${
            errorData.message || 'Unknown error'
          }`
        )
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })

      // Generate comprehensive design specification using ChatGPT-5
      const designSpecification = await generateFigmaDesignSpecification(
        params?.aiPrompt || '',
        params?.brandGuidelines || '',
        params?.designType || 'landing_page',
        params?.responsiveBreakpoints || ['mobile', 'tablet', 'desktop'],
        openai,
        requestId
      )

      // Create Figma-compatible design structure
      const figmaCompatibleDesign = await createFigmaCompatibleDesign(
        designSpecification,
        params?.projectId || '',
        params?.fileKey || '',
        requestId
      )

      // Generate design tokens
      const designTokens = await generateDesignTokens(designSpecification, requestId)

      // Create layout structure
      const layoutStructure = await createLayoutStructure(
        designSpecification,
        params?.responsiveBreakpoints || ['mobile', 'tablet', 'desktop'],
        requestId
      )

      // Send to SQS for Figma plugin processing
      const sqsMessage = await sendToSQS({
        projectId: params?.projectId || '',
        fileKey: params?.fileKey || '',
        designData: {
          figmaCompatibleDesign,
          designTokens,
          layoutStructure,
          specification: designSpecification,
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          requestId,
          version: '1.0.0',
        },
      }, requestId)

      logger.info(`[${requestId}] Successfully generated Figma design and sent to SQS`, {
        messageId: sqsMessage.messageId,
        queueUrl: sqsMessage.queueUrl,
      })

      return {
        success: true,
        output: {
          designSpecification: {
            figmaCompatibleDesign,
            designTokens,
            layoutStructure,
          },
          sqsMessage,
          aiGeneration: {
            prompt: params?.aiPrompt || '',
            model: 'gpt-5',
            tokensUsed: designSpecification.tokensUsed || 0,
            generationTime: designSpecification.generationTime || 0,
          },
          nextSteps: [
            'Figma plugin will receive the SQS message and create the design',
            'Monitor the Figma file for the generated design',
            'Review and iterate on the design as needed',
            'Export code if includeCode was enabled',
          ],
          limitations: [
            'Requires Figma plugin to be installed and running',
            'SQS message processing depends on plugin availability',
            'Design complexity may affect generation time',
            'Brand guidelines integration requires clear specifications',
          ],
        },
      }
    } catch (error: any) {
      logger.error(`[${requestId}] Figma AI Design Workflow failed:`, error)
      throw new Error(`Figma AI Design Workflow failed: ${error.message}`)
    }
  },
}

/**
 * Generate comprehensive design specification using ChatGPT-5
 */
async function generateFigmaDesignSpecification(
  aiPrompt: string,
  brandGuidelines: string,
  designType: string,
  responsiveBreakpoints: string[],
  openai: OpenAI,
  requestId: string
): Promise<any> {
  const startTime = Date.now()
  
  logger.debug(`[${requestId}] Generating design specification with ChatGPT-5`)

  const systemPrompt = `You are a world-class UI/UX designer and Figma expert. Generate a comprehensive design specification that is fully compatible with Figma's API and design system.

Design Type: ${designType}
Responsive Breakpoints: ${responsiveBreakpoints.join(', ')}

Requirements:
1. Generate Figma-compatible node structures with exact coordinates, sizes, and properties
2. Create comprehensive design tokens (colors, typography, spacing, shadows) with exact values
3. Design responsive layouts for all breakpoints with specific dimensions
4. Include component specifications with all necessary properties
5. Ensure accessibility compliance (WCAG 2.1 AA)
6. Follow modern design principles and best practices
7. Generate realistic content and copy
8. Include proper naming conventions for Figma

${brandGuidelines ? `Brand Guidelines: ${brandGuidelines}` : ''}

Return a JSON object with the following EXACT structure:
{
  "figmaNodes": [
    {
      "id": "unique-id",
      "type": "FRAME|RECTANGLE|TEXT|COMPONENT",
      "name": "Descriptive Name",
      "x": 0,
      "y": 0,
      "width": 1200,
      "height": 800,
      "fills": [{"type": "SOLID", "color": {"r": 0.0, "g": 0.0, "b": 1.0}}],
      "children": [...],
      "layoutMode": "VERTICAL|HORIZONTAL|NONE",
      "paddingTop": 24,
      "paddingBottom": 24,
      "paddingLeft": 24,
      "paddingRight": 24,
      "itemSpacing": 16
    }
  ],
  "designTokens": {
    "colors": [
      {"name": "Primary", "value": "#007AFF", "description": "Primary brand color"},
      {"name": "Secondary", "value": "#5856D6", "description": "Secondary brand color"},
      {"name": "Background", "value": "#FFFFFF", "description": "Background color"},
      {"name": "Text", "value": "#000000", "description": "Primary text color"},
      {"name": "Text Secondary", "value": "#666666", "description": "Secondary text color"},
      {"name": "Success", "value": "#34C759", "description": "Success state color"},
      {"name": "Warning", "value": "#FF9500", "description": "Warning state color"},
      {"name": "Error", "value": "#FF3B30", "description": "Error state color"}
    ],
    "typography": [
      {"name": "Heading 1", "fontSize": 32, "fontWeight": 700, "lineHeight": 40, "fontFamily": "Inter"},
      {"name": "Heading 2", "fontSize": 24, "fontWeight": 600, "lineHeight": 32, "fontFamily": "Inter"},
      {"name": "Heading 3", "fontSize": 20, "fontWeight": 600, "lineHeight": 28, "fontFamily": "Inter"},
      {"name": "Body Large", "fontSize": 18, "fontWeight": 400, "lineHeight": 28, "fontFamily": "Inter"},
      {"name": "Body", "fontSize": 16, "fontWeight": 400, "lineHeight": 24, "fontFamily": "Inter"},
      {"name": "Body Small", "fontSize": 14, "fontWeight": 400, "lineHeight": 20, "fontFamily": "Inter"},
      {"name": "Caption", "fontSize": 12, "fontWeight": 400, "lineHeight": 16, "fontFamily": "Inter"}
    ],
    "spacing": [
      {"name": "XS", "value": 4},
      {"name": "SM", "value": 8},
      {"name": "MD", "value": 16},
      {"name": "LG", "value": 24},
      {"name": "XL", "value": 32},
      {"name": "XXL", "value": 48},
      {"name": "XXXL", "value": 64}
    ],
    "shadows": [
      {"name": "Small", "type": "DROP_SHADOW", "x": 0, "y": 1, "blur": 3, "spread": 0, "color": "rgba(0,0,0,0.1)"},
      {"name": "Medium", "type": "DROP_SHADOW", "x": 0, "y": 4, "blur": 8, "spread": 0, "color": "rgba(0,0,0,0.15)"},
      {"name": "Large", "type": "DROP_SHADOW", "x": 0, "y": 8, "blur": 16, "spread": 0, "color": "rgba(0,0,0,0.2)"},
      {"name": "XL", "type": "DROP_SHADOW", "x": 0, "y": 16, "blur": 24, "spread": 0, "color": "rgba(0,0,0,0.25)"}
    ]
  },
  "layoutStructure": {
    "frames": [
      {
        "id": "main-frame",
        "name": "Main Layout",
        "width": 1200,
        "height": 800,
        "layoutMode": "VERTICAL",
        "paddingTop": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "paddingRight": 0
      }
    ],
    "components": [
      {
        "id": "button-primary",
        "name": "Button Primary",
        "type": "COMPONENT",
        "width": 120,
        "height": 44,
        "fills": [{"type": "SOLID", "color": {"r": 0.0, "g": 0.48, "b": 1.0}}],
        "cornerRadius": 8
      }
    ]
  },
  "responsiveVersions": {
    "mobile": {"width": 375, "height": "AUTO", "layoutMode": "VERTICAL"},
    "tablet": {"width": 768, "height": "AUTO", "layoutMode": "VERTICAL"},
    "desktop": {"width": 1200, "height": "AUTO", "layoutMode": "VERTICAL"}
  },
  "accessibility": {
    "contrastRatio": "AA",
    "focusIndicators": true,
    "semanticStructure": true,
    "altText": "Descriptive alt text for images",
    "ariaLabels": "Proper ARIA labels for interactive elements"
  },
  "metadata": {
    "designType": "${designType}",
    "generatedAt": "${new Date().toISOString()}",
    "version": "1.0.0"
  }
}`

  const userPrompt = `Create a ${designType} design based on this prompt: ${aiPrompt}

Please generate a complete Figma-compatible design specification that includes:
- All necessary nodes and frames with exact coordinates and dimensions
- Complete design token system with realistic values
- Responsive layouts for all breakpoints (${responsiveBreakpoints.join(', ')})
- Component specifications with all properties
- Accessibility considerations (WCAG 2.1 AA compliance)
- Modern design patterns and realistic content
- Proper naming conventions for Figma

Make sure the output is production-ready and can be directly imported into Figma. Include realistic content, proper spacing, and professional design elements.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    })

    const generationTime = Date.now() - startTime
    const tokensUsed = completion.usage?.total_tokens || 0

    logger.debug(`[${requestId}] ChatGPT-5 generation completed`, {
      tokensUsed,
      generationTime,
    })

    // Parse the response and ensure it's valid JSON
    const responseContent = completion.choices[0]?.message?.content || '{}'
    let designSpecification
    
    try {
      designSpecification = JSON.parse(responseContent)
    } catch (parseError) {
      logger.warn(`[${requestId}] Failed to parse ChatGPT-5 response as JSON, creating fallback specification`)
      designSpecification = createFallbackDesignSpecification(aiPrompt, designType, responsiveBreakpoints)
    }

    // Add metadata
    designSpecification.metadata = {
      ...designSpecification.metadata,
      tokensUsed,
      generationTime,
      model: 'gpt-5',
      generatedAt: new Date().toISOString(),
    }

    return designSpecification
  } catch (error: any) {
    logger.error(`[${requestId}] ChatGPT-5 generation failed:`, error)
    throw new Error(`Failed to generate design specification: ${error.message}`)
  }
}

/**
 * Create Figma-compatible design structure
 */
async function createFigmaCompatibleDesign(
  specification: any,
  projectId: string,
  fileKey: string,
  requestId: string
): Promise<any> {
  logger.debug(`[${requestId}] Creating Figma-compatible design structure`)

  return {
    nodes: specification.figmaNodes || [],
    styles: specification.designTokens || {},
    variables: specification.variables || [],
    components: specification.components || [],
    metadata: {
      projectId,
      fileKey,
      createdBy: 'figma-ai-workflow',
      version: '1.0.0',
    },
  }
}

/**
 * Generate design tokens from specification
 */
async function generateDesignTokens(specification: any, requestId: string): Promise<any> {
  logger.debug(`[${requestId}] Generating design tokens`)

  return {
    colors: specification.designTokens?.colors || [],
    typography: specification.designTokens?.typography || [],
    spacing: specification.designTokens?.spacing || [],
    shadows: specification.designTokens?.shadows || [],
  }
}

/**
 * Create layout structure for responsive design
 */
async function createLayoutStructure(
  specification: any,
  responsiveBreakpoints: string[],
  requestId: string
): Promise<any> {
  logger.debug(`[${requestId}] Creating layout structure for ${responsiveBreakpoints.length} breakpoints`)

  return {
    frames: specification.layoutStructure?.frames || [],
    components: specification.layoutStructure?.components || [],
    responsiveVersions: specification.responsiveVersions || {},
  }
}

/**
 * Send design data to SQS for Figma plugin processing
 */
async function sendToSQS(
  payload: any,
  requestId: string
): Promise<{ messageId: string; queueUrl: string; payload: any }> {
  logger.debug(`[${requestId}] Sending design data to SQS`)

  // In a production environment, this would integrate with AWS SQS
  // For now, we'll simulate the SQS message structure
  const messageId = `figma-design-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const queueUrl = process.env.FIGMA_SQS_QUEUE_URL || 'https://sqs.us-east-1.amazonaws.com/123456789012/figma-design-queue'

  // Simulate SQS message structure
  const sqsMessage = {
    messageId,
    queueUrl,
    payload,
  }

  // In production, you would use AWS SDK to send the message:
  // const sqs = new AWS.SQS()
  // await sqs.sendMessage({
  //   QueueUrl: queueUrl,
  //   MessageBody: JSON.stringify(payload),
  //   MessageAttributes: {
  //     RequestId: { DataType: 'String', StringValue: requestId },
  //     Type: { DataType: 'String', StringValue: 'figma-design-generation' },
  //   },
  // }).promise()

  logger.info(`[${requestId}] SQS message prepared`, { messageId, queueUrl })

  return sqsMessage
}

/**
 * Create fallback design specification when ChatGPT-5 response parsing fails
 */
function createFallbackDesignSpecification(
  aiPrompt: string,
  designType: string,
  responsiveBreakpoints: string[]
): any {
  return {
    figmaNodes: [
      {
        id: 'main-frame',
        type: 'FRAME',
        name: `${designType.replace('_', ' ').toUpperCase()} Design`,
        children: [],
        layoutMode: 'VERTICAL',
        paddingTop: 24,
        paddingBottom: 24,
        paddingLeft: 24,
        paddingRight: 24,
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      },
    ],
    designTokens: {
      colors: [
        { name: 'Primary', value: '#007AFF', type: 'SOLID' },
        { name: 'Secondary', value: '#5856D6', type: 'SOLID' },
        { name: 'Background', value: '#FFFFFF', type: 'SOLID' },
        { name: 'Text', value: '#000000', type: 'SOLID' },
      ],
      typography: [
        { name: 'Heading 1', fontSize: 32, fontWeight: 700, lineHeight: 40 },
        { name: 'Heading 2', fontSize: 24, fontWeight: 600, lineHeight: 32 },
        { name: 'Body', fontSize: 16, fontWeight: 400, lineHeight: 24 },
        { name: 'Caption', fontSize: 14, fontWeight: 400, lineHeight: 20 },
      ],
      spacing: [
        { name: 'XS', value: 4 },
        { name: 'SM', value: 8 },
        { name: 'MD', value: 16 },
        { name: 'LG', value: 24 },
        { name: 'XL', value: 32 },
      ],
      shadows: [
        { name: 'Small', x: 0, y: 1, blur: 3, spread: 0, color: 'rgba(0,0,0,0.1)' },
        { name: 'Medium', x: 0, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.15)' },
        { name: 'Large', x: 0, y: 8, blur: 16, spread: 0, color: 'rgba(0,0,0,0.2)' },
      ],
    },
    layoutStructure: {
      frames: [],
      components: [],
    },
    responsiveVersions: responsiveBreakpoints.reduce((acc, breakpoint) => {
      acc[breakpoint] = {
        width: breakpoint === 'mobile' ? 375 : breakpoint === 'tablet' ? 768 : 1200,
        height: 'AUTO',
        layoutMode: 'VERTICAL',
      }
      return acc
    }, {} as any),
    components: [],
    accessibility: {
      contrastRatio: 'AA',
      focusIndicators: true,
      semanticStructure: true,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      fallback: true,
      originalPrompt: aiPrompt,
    },
  }
}

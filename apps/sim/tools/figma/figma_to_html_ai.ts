import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('FigmaToHTMLAI')

// Parameters for the tool
export interface FigmaToHTMLAIParams {
  fileKey: string
  nodeId?: string
  includeStyles?: boolean
  responsive?: boolean
  outputFormat?: 'html' | 'react' | 'vue'
  customPrompt?: string
}

// Response interface
export interface FigmaToHTMLAIResponse {
  success: boolean
  output: {
    metadata: {
      fileKey: string
      nodeId?: string
      processingTime: number
      aiModel: string
      tokensUsed: number
      combinedHtml: string
    }
  }
  error?: string
}

// Optimize Figma data for AI processing
function optimizeFigmaData(figmaData: any, nodeId: string): any {
  const node = nodeId.replace('-', ':')
  const optimized = {
    document: figmaData.nodes[node].document,
    components: figmaData.nodes[node].components || {},
    styles: figmaData.nodes[node].styles || {},
    name: figmaData.name,
    lastModified: figmaData.nodes[node].lastModified,
    version: figmaData.nodes[node].version,
    thumbnailUrl: figmaData.thumbnailUrl,
  }

  // Remove unnecessary data to reduce token usage
  function cleanNode(node: any): any {
    if (!node) return null

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
      absoluteBoundingBox: node.absoluteBoundingBox,
      fills: node.fills,
      strokes: node.strokes,
      strokeWeight: node.strokeWeight,
      cornerRadius: node.cornerRadius,
      characters: node.characters,
      style: node.style,
      layoutMode: node.layoutMode,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      paddingLeft: node.paddingLeft,
      paddingRight: node.paddingRight,
      paddingTop: node.paddingTop,
      paddingBottom: node.paddingBottom,
      itemSpacing: node.itemSpacing,
      children: node.children ? node.children.map(cleanNode).filter(Boolean) : undefined,
    }
  }

  if (optimized.document) {
    optimized.document = cleanNode(optimized.document)
  }

  return optimized
}

// Generate AI prompt for HTML/CSS conversion
function generateAIPrompt(figmaData: any, params: FigmaToHTMLAIParams): string {
  const optimizedData = optimizeFigmaData(figmaData, params.nodeId || '')
  const figmaJson = JSON.stringify(optimizedData, null, 2)

  const basePrompt = `You are an expert frontend developer specializing in converting Figma designs to clean, semantic, and accessible HTML/CSS code.

CRITICAL REQUIREMENTS:
1. Process ALL sections and components in the Figma design
2. Include every text element, button, input field, image, and layout component
3. Generate complete, functional HTML with embedded CSS
4. Use modern HTML5 semantic elements and CSS Grid/Flexbox
5. Implement responsive design with mobile-first approach
6. Include proper accessibility attributes (ARIA labels, roles, etc.)
7. Use CSS custom properties for design tokens
8. Generate clean, maintainable code with comments
9. USE THE PROVIDED IMAGES: Replace any image placeholders with the actual image URLs provided below

Figma Design Data:
${figmaJson}

CRITICAL OUTPUT REQUIREMENTS:
- Generate ONLY ONE complete HTML5 document with DOCTYPE, html, head, and body tags
- ALL CSS styles MUST be embedded in <style> tags within the <head> section
- DO NOT generate separate HTML and CSS sections
- DO NOT use external CSS files or separate CSS blocks
- Return a single, complete HTML document with embedded styles

Technical Requirements:
- Use semantic HTML5 elements (header, nav, main, section, article, aside, footer, button, input, etc.)
- Include comprehensive accessibility attributes
- Implement responsive design with CSS Grid and Flexbox
- Use CSS custom properties for design tokens
- Include proper focus management and keyboard navigation
- Generate clean, maintainable code with comments
- Process EVERY element in the design hierarchy - do not skip any children or nested elements
- Use the exact colors provided in the Figma data
- Preserve all text content exactly as shown in the design
- Include all visual elements, shapes, and components from the design
- Maintain the exact layout structure and positioning from Figma
- For images, use proper <img> tags with alt attributes for accessibility
- Remove all newline characters (\n) from the output
- Use class names that correspond to the CSS selectors

${params.customPrompt ? `\nAdditional Requirements: ${params.customPrompt}` : ''}

RESPONSE FORMAT - Return ONLY this:
<!DOCTYPE html><html><head><style>/* ALL CSS STYLES HERE */</style></head><body><!-- ALL HTML CONTENT HERE --></body></html>`

  return basePrompt
}

// Call AI service to convert Figma data to HTML/CSS
async function callAIService(
  prompt: string,
  params: FigmaToHTMLAIParams
): Promise<{
  combinedHtml: string
  model: string
  tokens: number
}> {
  const startTime = Date.now()

  try {
    // Call OpenAI API directly
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert frontend developer specializing in converting Figma designs to clean, semantic, and accessible HTML/CSS code. Always respond with a single HTML document that includes embedded CSS in <style> tags within the <head> section. Do NOT generate separate HTML and CSS sections. Return only one complete HTML document with embedded styles. Remove all newline characters from the output.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}. ${errorData.error?.message || 'Unknown error'}`
      )
    }

    const data = await response.json()
    const processingTime = Date.now() - startTime

    // Parse AI response to extract combined HTML/CSS
    const content = data.choices?.[0]?.message?.content || ''
    
    // Clean the combined HTML/CSS response
    let combinedHtml = content.trim()
    
    // If AI still returned separate HTML and CSS sections, combine them
    const htmlMatch = content.match(/HTML:\s*([\s\S]*?)(?=CSS:|$)/i)
    const cssMatch = content.match(/CSS:\s*([\s\S]*?)$/i)
    
    if (htmlMatch && cssMatch) {
      // AI returned separate sections, combine them
      let html = htmlMatch[1].trim()
      let css = cssMatch[1].trim()
      
      // Clean HTML and CSS
      html = html.replace(/\n/g, '').replace(/\\/g, '')
      css = css.replace(/\n/g, '').replace(/\\/g, '')
      
      // Create combined HTML with embedded CSS
      combinedHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Figma Design</title><style>${css}</style></head><body>${html}</body></html>`
    } else {
      // AI returned combined format, clean it thoroughly
      combinedHtml = combinedHtml
        .replace(/\n/g, '')                    // Remove newlines
        .replace(/\\/g, '')                     // Remove all backslashes
        .replace(/\\"/g, '"')                  // Replace escaped quotes with regular quotes
        .replace(/\\'/g, "'")                  // Replace escaped single quotes
        .replace(/\\t/g, '')                   // Remove escaped tabs
        .replace(/\\r/g, '')                    // Remove escaped carriage returns
    }

    return {
      combinedHtml,
      model: data.model || 'gpt-5',
      tokens: data.usage?.total_tokens || 0,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('AI service error', { error: errorMessage })

    // Fallback: Generate basic HTML structure with embedded CSS
    const fallbackHtml = generateFallbackCombinedHTML()

    return {
      combinedHtml: fallbackHtml,
      model: 'fallback',
      tokens: 0,
    }
  }
}

// Generate fallback combined HTML with embedded CSS when AI service fails
function generateFallbackCombinedHTML(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Figma Design</title><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 1200px; margin: 0 auto; padding: 20px; } .header { background: #f8f9fa; padding: 20px 0; margin-bottom: 40px; } .content { display: grid; gap: 20px; } .section { background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; } .button { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 16px; } .button:hover { background: #0056b3; } @media (max-width: 768px) { .container { padding: 10px; } }</style></head><body><div class="container"><header class="header"><h1>Figma Design</h1><p>This is a fallback HTML structure. Please check your AI service configuration.</p></header><main class="content"><section class="section"><h2>Content Section</h2><p>This is a placeholder for your Figma design content.</p><button class="button">Action Button</button></section></main></div></body></html>`
}

// Main tool configuration
export const figmaToHTMLAITool: ToolConfig<FigmaToHTMLAIParams, FigmaToHTMLAIResponse> = {
  id: 'figma_to_html_ai',
  name: 'Convert Figma to HTML with AI',
  description:
    'Convert Figma designs to HTML and CSS using advanced AI processing. Extracts data from Figma API using file key and node ID, then generates responsive code with design system extraction.',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key (required)',
      required: true,
      visibility: 'user-or-llm',
    },
    nodeId: {
      type: 'string',
      description: 'Specific node ID to convert (optional - converts entire file if not provided)',
      required: false,
      visibility: 'user-or-llm',
    },
    includeStyles: {
      type: 'boolean',
      description: 'Whether to include CSS styles (default: true)',
      required: false,
      visibility: 'user-or-llm',
    },
    responsive: {
      type: 'boolean',
      description: 'Whether to make the output responsive (default: true)',
      required: false,
      visibility: 'user-or-llm',
    },
    outputFormat: {
      type: 'string',
      description: 'Output format (html, react, or vue)',
      required: false,
      visibility: 'user-or-llm',
    },
    customPrompt: {
      type: 'string',
      description: 'Custom AI prompt for specific requirements',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: (params) => {
      // Always use Figma API with file key
      if (params.nodeId) {
        return `https://api.figma.com/v1/files/${params.fileKey}/nodes?ids=${params.nodeId}`
      }
      return `https://api.figma.com/v1/files/${params.fileKey}`
    },
    method: 'GET',
    headers: () => ({
      'X-Figma-Token': process.env.FIGMA_API_KEY || '',
    }),
  },
  transformResponse: async (response, params) => {
    const startTime = Date.now()

    if (!params) {
      throw new Error('Missing required parameters')
    }

    try {
      // Extract data from Figma API response
      const data = await response.json()
      const figmaData = data

      // Generate AI prompt
      const prompt = generateAIPrompt(figmaData, params)

      // Call AI service
      const aiResult = await callAIService(prompt, params)

      const processingTime = Date.now() - startTime

      // Final cleanup of combined HTML
      const finalCombinedHtml = aiResult.combinedHtml
        .replace(/\\/g, '')                     // Remove all backslashes
        .replace(/\\"/g, '"')                  // Replace escaped quotes with regular quotes
        .replace(/\\'/g, "'")                  // Replace escaped single quotes

      return {
        success: true,
        output: {
          metadata: {
            fileKey: params.fileKey,
            nodeId: params.nodeId,
            processingTime,
            aiModel: aiResult.model,
            tokensUsed: aiResult.tokens,
            combinedHtml: finalCombinedHtml,
          },
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error('Figma to HTML conversion failed', {
        error: errorMessage,
        fileKey: params.fileKey,
        nodeId: params.nodeId,
      })

      // Final cleanup of fallback HTML
      const finalFallbackHtml = generateFallbackCombinedHTML()
        .replace(/\\/g, '')                     // Remove all backslashes
        .replace(/\\"/g, '"')                  // Replace escaped quotes with regular quotes
        .replace(/\\'/g, "'")                  // Replace escaped single quotes

      return {
        success: false,
        output: {
          metadata: {
            fileKey: params.fileKey,
            nodeId: params.nodeId,
            processingTime: Date.now() - startTime,
            aiModel: 'fallback',
            tokensUsed: 0,
            combinedHtml: finalFallbackHtml,
          },
        },
        error: errorMessage,
      }
    }
  },

  outputs: {
    metadata: {
      type: 'object',
      description: 'Metadata about the conversion process including combined HTML/CSS',
      properties: {
        fileKey: { type: 'string', description: 'Figma file key' },
        nodeId: { type: 'string', description: 'Figma node ID', optional: true },
        processingTime: { type: 'number', description: 'Processing time in milliseconds' },
        aiModel: { type: 'string', description: 'AI model used for conversion' },
        tokensUsed: { type: 'number', description: 'Number of tokens used' },
        combinedHtml: { type: 'string', description: 'Generated HTML document with embedded CSS styles' },
      },
    },
  },
}

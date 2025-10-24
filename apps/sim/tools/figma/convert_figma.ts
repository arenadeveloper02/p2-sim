import { createHash } from 'crypto'
import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'
import type { ConvertFigmaParams, ConvertFigmaResponse } from './types'

const logger = createLogger('ConvertFigmaTool')

// Enhanced AI cache with metadata
interface AICacheEntry {
  result: string
  timestamp: number
  metadata: {
    promptHash: string
    model: string
    tokens: number
    processingTime: number
  }
}

const aiCache = new Map<string, AICacheEntry>()

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes for better performance

// Cache cleanup function with metrics
function cleanupCache() {
  const now = Date.now()
  let cleanedCount = 0
  let totalSize = 0

  for (const [key, value] of aiCache.entries()) {
    totalSize += value.result.length
    if (now - value.timestamp > CACHE_TTL) {
      aiCache.delete(key)
      cleanedCount++
    }
  }

  logger.info('Cache cleanup completed', {
    cleanedEntries: cleanedCount,
    remainingEntries: aiCache.size,
    totalCacheSize: totalSize,
  })
}

// Figma node types for better type safety
interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: FigmaNode[]
  absoluteBoundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  fills?: Array<{
    type: string
    color?: {
      r: number
      g: number
      b: number
      a: number
    }
    gradientStops?: Array<{
      color: { r: number; g: number; b: number; a: number }
      position: number
    }>
  }>
  strokes?: Array<{
    type: string
    color?: {
      r: number
      g: number
      b: number
      a: number
    }
    strokeWeight?: number
  }>
  cornerRadius?: number
  characters?: string
  style?: {
    fontFamily: string
    fontSize: number
    textAlignHorizontal: string
    textAlignVertical: string
    letterSpacing?: number
    lineHeightPx?: number
    fontWeight?: number
  }
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  itemSpacing?: number
  constraints?: {
    horizontal: string
    vertical: string
  }
  effects?: Array<{
    type: string
    radius?: number
    color?: { r: number; g: number; b: number; a: number }
    offset?: { x: number; y: number }
  }>
}

// Conversion context for better AI understanding
interface ConversionContext {
  fileKey: string
  nodeId?: string
  outputFormat: 'html' | 'react' | 'angular'
  responsive: boolean
  includeStyles: boolean
  designSystem?: {
    colors: string[]
    typography: string[]
    spacing: number[]
    components: string[]
    designVariables?: Array<{
      id: string
      property: string
      nodeId: string
      nodeName: string
      nodeType: string
    }>
  }
}

export const convertFigmaTool: ToolConfig<ConvertFigmaParams, ConvertFigmaResponse> = {
  id: 'convert_figma',
  name: 'Convert Figma to Code with AI',
  description:
    'Convert Figma designs to HTML, React, or Angular code using advanced AI-powered analysis with intelligent component detection and responsive design generation',
  version: '2.0.0',
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
      required: true,
      visibility: 'user-or-llm',
    },
    outputFormat: {
      type: 'string',
      description: 'Output format for conversion (html, react, or angular)',
      required: true,
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
  },
  request: {
    url: (params) => {
      // If no nodeId provided, get the entire file
      if (!params.nodeId || !params.nodeId.trim()) {
        return `https://api.figma.com/v1/files/${params.fileKey}`
      }

      // Handle single node request
      const queryParams = new URLSearchParams()
      queryParams.append('ids', params.nodeId.trim())

      return `https://api.figma.com/v1/files/${params.fileKey}/nodes?${queryParams.toString()}`
    },
    method: 'GET',
    headers: () => ({
      'X-Figma-Token':
        process.env.FIGMA_API_KEY || 'figd_91mOtrt2ow4q2OWvwsROQYPB74fwOa6Vact1JFroc',
    }),
  },
  transformResponse: async (response, params) => {
    const startTime = Date.now()

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Figma API error: ${response.status} ${response.statusText}. ${
          errorData.message || 'Unknown error'
        }`
      )
    }

    const fileData = await response.json()

    // Enhanced logging with performance metrics
    logger.info('Figma file data received:', {
      hasDocument: !!fileData.document,
      documentChildren: fileData.document?.children?.length || 0,
      hasNodes: !!fileData.nodes,
      nodeCount: Object.keys(fileData.nodes || {}).length,
      outputFormat: params?.outputFormat,
      nodeId: params?.nodeId,
      availableNodeIds: Object.keys(fileData.nodes || {}),
      documentNodeIds: fileData.document ? getAllNodeIds(fileData.document) : [],
      fileSize: JSON.stringify(fileData).length,
    })

    // Clean up cache periodically
    cleanupCache()

    // Create conversion context
    const context: ConversionContext = {
      fileKey: params?.fileKey || '',
      nodeId: params?.nodeId,
      outputFormat: params?.outputFormat || 'html',
      responsive: params?.responsive !== false, // Default to true
      includeStyles: params?.includeStyles !== false, // Default to true
    }

    // Get available node IDs for debugging
    const availableNodeIds = getAvailableNodeIds(fileData)

    // Extract and analyze design system
    const designSystem = extractDesignSystem(fileData)
    context.designSystem = designSystem

    logger.info('Design system extracted:', {
      colors: designSystem?.colors.length || 0,
      typography: designSystem?.typography.length || 0,
      spacing: designSystem?.spacing.length || 0,
      components: designSystem?.components.length || 0,
    })

    // AI-powered conversion with enhanced error handling
    let generatedCode = ''
    let styles = ''
    const aiEnabled = !!process.env.OPENAI_API_KEY
    const conversionMetrics = {
      processingTime: 0,
      tokensUsed: 0,
      cacheHits: 0,
      errors: [] as string[],
    }

    logger.info('AI configuration check:', {
      aiEnabled,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      designSystemColors: designSystem?.colors.length || 0,
      designSystemComponents: designSystem?.components.length || 0,
    })

    try {
      if (aiEnabled) {
        logger.info('Using AI-powered conversion with enhanced analysis')

        const conversionStartTime = Date.now()

        // Generate comprehensive HTML with embedded CSS for better structure
        // Only HTML+CSS generation is supported
        const htmlWithCSS = await generateHTMLWithEmbeddedCSS(fileData, context)
        generatedCode = htmlWithCSS.html
        styles = htmlWithCSS.css
        logger.info('AI HTML generation completed', {
          htmlLength: generatedCode.length,
          cssLength: styles.length,
          htmlPreview: `${generatedCode.substring(0, 200)}...`,
        })

        conversionMetrics.processingTime = Date.now() - conversionStartTime

        logger.info('AI conversion completed', {
          processingTime: conversionMetrics.processingTime,
          codeLength: generatedCode.length,
          stylesLength: styles.length,
        })
      } else {
        logger.info('OpenAI API key not configured, using enhanced fallback conversion')

        // Enhanced fallback conversion
        const fallbackStartTime = Date.now()

        // Only HTML+CSS generation is supported
        generatedCode = generateHTMLWithDesignSystem(fileData, context)
        if (context.includeStyles) {
          styles = generateCSSWithDesignSystem(fileData, context)
        }
        logger.info('Fallback HTML generation completed', {
          htmlLength: generatedCode.length,
          cssLength: styles.length,
          htmlPreview: `${generatedCode.substring(0, 200)}...`,
        })

        conversionMetrics.processingTime = Date.now() - fallbackStartTime
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error'
      conversionMetrics.errors.push(errorMessage)
      logger.error('Conversion error:', error)

      // Provide fallback with error information
      generatedCode = generateErrorFallback(context, errorMessage)
      if (context.includeStyles) {
        styles = generateErrorCSS(errorMessage)
      }
    }

    const totalTime = Date.now() - startTime

    return {
      success: true,
      output: {
        content: `Successfully converted Figma file "${context.fileKey}" to ${context.outputFormat.toUpperCase()} code${aiEnabled ? ' using advanced AI analysis' : ' using enhanced conversion'}. Generated ${context.includeStyles ? 'HTML/CSS' : 'HTML'} output with ${designSystem?.components.length || 0} detected components and ${designSystem?.colors.length || 0} color variables. Processing completed in ${totalTime}ms.`,
        metadata: {
          fileKey: context.fileKey,
          nodeId: context.nodeId || 'root',
          outputFormat: context.outputFormat,
          generatedCode,
          styles: context.includeStyles ? styles : undefined,
          debugInfo: {
            hasDocument: !!fileData.document,
            documentChildren: fileData.document?.children?.length || 0,
            hasNodes: !!fileData.nodes,
            nodeCount: Object.keys(fileData.nodes || {}).length,
            designSystem,
            conversionMetrics,
            totalProcessingTime: totalTime,
          },
          aiEnabled,
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Generated code content',
    },
    metadata: {
      type: 'object',
      description: 'Conversion metadata',
      properties: {
        fileKey: { type: 'string', description: 'Figma file key' },
        nodeId: { type: 'string', description: 'Node ID that was converted' },
        outputFormat: { type: 'string', description: 'Output format used' },
        generatedCode: { type: 'string', description: 'The generated code' },
        styles: { type: 'string', description: 'CSS styles if included' },
      },
    },
  },
}

// Enhanced design system extraction with support for design variables and rich styling
function extractDesignSystem(fileData: any): ConversionContext['designSystem'] {
  const colors = new Set<string>()
  const typography = new Set<string>()
  const spacing = new Set<number>()
  const components = new Set<string>()
  const designVariables = new Map<string, any>()

  function analyzeNode(node: any) {
    if (!node) return

    // Extract colors from fills and strokes
    if (node.fills) {
      node.fills.forEach((fill: any) => {
        if (fill.color) {
          const color = `rgba(${Math.round(fill.color.r * 255)}, ${Math.round(fill.color.g * 255)}, ${Math.round(fill.color.b * 255)}, ${fill.color.a || 1})`
          colors.add(color)
        }
        // Handle gradient stops
        if (fill.gradientStops) {
          fill.gradientStops.forEach((stop: any) => {
            if (stop.color) {
              const color = `rgba(${Math.round(stop.color.r * 255)}, ${Math.round(stop.color.g * 255)}, ${Math.round(stop.color.b * 255)}, ${stop.color.a || 1})`
              colors.add(color)
            }
          })
        }
      })
    }

    if (node.strokes) {
      node.strokes.forEach((stroke: any) => {
        if (stroke.color) {
          const color = `rgba(${Math.round(stroke.color.r * 255)}, ${Math.round(stroke.color.g * 255)}, ${Math.round(stroke.color.b * 255)}, ${stroke.color.a || 1})`
          colors.add(color)
        }
      })
    }

    // Extract typography with more comprehensive details
    if (node.style) {
      if (node.style.fontFamily) {
        typography.add(node.style.fontFamily)
      }
      if (node.style.fontSize) {
        typography.add(`${node.style.fontSize}px`)
      }
      if (node.style.fontWeight) {
        typography.add(`font-weight: ${node.style.fontWeight}`)
      }
      if (node.style.fontStyle) {
        typography.add(`font-style: ${node.style.fontStyle}`)
      }
      if (node.style.textCase) {
        typography.add(`text-transform: ${node.style.textCase.toLowerCase()}`)
      }
      if (node.style.letterSpacing) {
        typography.add(`letter-spacing: ${node.style.letterSpacing}px`)
      }
      if (node.style.lineHeightPx) {
        typography.add(`line-height: ${node.style.lineHeightPx}px`)
      }
    }

    // Extract spacing from padding, margins, and other layout properties
    if (node.paddingLeft) spacing.add(node.paddingLeft)
    if (node.paddingRight) spacing.add(node.paddingRight)
    if (node.paddingTop) spacing.add(node.paddingTop)
    if (node.paddingBottom) spacing.add(node.paddingBottom)
    if (node.itemSpacing) spacing.add(node.itemSpacing)
    if (node.cornerRadius) spacing.add(node.cornerRadius)
    if (node.strokeWeight) spacing.add(node.strokeWeight)

    // Extract layout spacing
    if (node.absoluteBoundingBox) {
      spacing.add(node.absoluteBoundingBox.width)
      spacing.add(node.absoluteBoundingBox.height)
    }

    // Identify components and instances
    if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      const componentName = node.name || 'Unknown Component'
      components.add(componentName)

      // Extract component properties
      if (node.componentProperties) {
        Object.entries(node.componentProperties).forEach(([key, value]: [string, any]) => {
          components.add(`${componentName}.${key}`)
        })
      }
    }

    // Extract design variables/tokens
    if (node.boundVariables) {
      Object.entries(node.boundVariables).forEach(([property, variables]: [string, any]) => {
        if (Array.isArray(variables)) {
          variables.forEach((variable: any) => {
            if (variable.type === 'VARIABLE_ALIAS') {
              designVariables.set(variable.id, {
                property,
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
              })
            }
          })
        }
      })
    }

    // Recursively analyze children
    if (node.children) {
      node.children.forEach(analyzeNode)
    }
  }

  // Analyze document and all nodes
  if (fileData.document) {
    analyzeNode(fileData.document)
  }

  if (fileData.nodes) {
    Object.values(fileData.nodes).forEach(analyzeNode)

    // Also analyze the document inside each node (for single node requests)
    Object.values(fileData.nodes).forEach((node: any) => {
      if (node.document) {
        analyzeNode(node.document)
      }
    })
  }

  return {
    colors: Array.from(colors),
    typography: Array.from(typography),
    spacing: Array.from(spacing).sort((a, b) => a - b),
    components: Array.from(components),
    designVariables: Array.from(designVariables.entries()).map(([id, info]) => ({
      id,
      ...info,
    })),
  }
}

// Enhanced node finder with better error handling
function findNodeById(node: any, targetId: string): any {
  if (!node) return null

  // Check if this node matches the target ID
  if (node.id === targetId) {
    return node
  }

  // Search in children
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, targetId)
      if (found) return found
    }
  }

  return null
}

// Helper function to get all node IDs from a document tree
function getAllNodeIds(node: any): string[] {
  if (!node) return []

  const ids = [node.id]

  if (node.children) {
    for (const child of node.children) {
      ids.push(...getAllNodeIds(child))
    }
  }

  return ids
}

// Helper function to get available node IDs for debugging
function getAvailableNodeIds(data: any): { nodes: string[]; document: string[]; all: string[] } {
  const nodeIds = Object.keys(data.nodes || {})
  const documentIds = data.document ? getAllNodeIds(data.document) : []
  const allIds = [...new Set([...nodeIds, ...documentIds])]

  return {
    nodes: nodeIds,
    document: documentIds,
    all: allIds,
  }
}

// Enhanced AI-powered conversion functions
async function generateHTMLWithAI(data: any, context: ConversionContext): Promise<string> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
    } else {
      targetNode = data.document
    }

    if (!targetNode) {
      return generateErrorFallback(
        context,
        `Could not find node ${context.nodeId || 'document'} in Figma file`
      )
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    logger.info('Enhanced figmaData prepared for AI:', {
      dataLength: JSON.stringify(optimizedData).length,
      nodeType: targetNode?.type,
      nodeName: targetNode?.name,
      childrenCount: targetNode?.children?.length || 0,
      totalChildrenProcessed: countAllChildren(optimizedData),
      hasTextElements: hasTextElements(optimizedData),
      hasImageElements: hasImageElements(optimizedData),
    })

    // Create enhanced AI prompt for HTML conversion with additional context
    const prompt = createHTMLPrompt(optimizedData, context)

    // Log the prompt length for debugging
    logger.info('AI prompt created:', {
      promptLength: prompt.length,
      dataStructure: {
        hasDocument: !!optimizedData,
        hasChildren: !!optimizedData?.children,
        childrenCount: optimizedData?.children?.length || 0,
        nodeTypes: getNodeTypes(optimizedData),
      },
    })

    // Call OpenAI API with enhanced error handling
    const htmlCode = await callOpenAI(prompt, 'gpt-4o')

    return `<!-- Generated HTML from Figma file using AI v2.0 -->
<!-- Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components -->
${htmlCode}`
  } catch (error) {
    logger.error('Error generating HTML with AI:', error)
    // Enhanced fallback with error information
    return generateErrorFallback(
      context,
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

async function generateReactWithAI(data: any, context: ConversionContext): Promise<string> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
    } else {
      targetNode = data.document
    }

    if (!targetNode) {
      return generateReactErrorFallback(
        context,
        `Could not find node ${context.nodeId || 'document'} in Figma file`
      )
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    logger.info('Enhanced React conversion data prepared:', {
      nodeType: targetNode.type,
      nodeName: targetNode.name,
      childrenCount: targetNode.children?.length || 0,
    })

    // Create enhanced AI prompt for React conversion
    const prompt = createReactPrompt(optimizedData, context)

    // Call OpenAI API with enhanced error handling
    const reactCode = await callOpenAI(prompt, 'gpt-4o')

    return `import React from 'react';
import './styles.css';

// Generated React component from Figma using AI v2.0
// Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components
${reactCode}`
  } catch (error) {
    logger.error('Error generating React with AI:', error)
    // Enhanced fallback with error information
    return generateReactErrorFallback(
      context,
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

async function generateAngularWithAI(data: any, context: ConversionContext): Promise<string> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
    } else {
      targetNode = data.document
    }

    if (!targetNode) {
      return generateAngularErrorFallback(
        context,
        `Could not find node ${context.nodeId || 'document'} in Figma file`
      )
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    logger.info('Enhanced Angular conversion data prepared:', {
      nodeType: targetNode.type,
      nodeName: targetNode.name,
      childrenCount: targetNode.children?.length || 0,
    })

    // Create enhanced AI prompt for Angular conversion
    const prompt = createAngularPrompt(optimizedData, context)

    // Call OpenAI API with enhanced error handling
    const angularCode = await callOpenAI(prompt, 'gpt-4o')

    return `import { Component } from '@angular/core';

// Generated Angular component from Figma using AI v2.0
// Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components
${angularCode}`
  } catch (error) {
    logger.error('Error generating Angular with AI:', error)
    // Enhanced fallback with error information
    return generateAngularErrorFallback(
      context,
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

async function generateCSSWithAI(data: any, context: ConversionContext): Promise<string> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
    } else {
      targetNode = data.document
    }

    if (!targetNode) {
      return generateErrorCSS(`Could not find node ${context.nodeId || 'document'} in Figma file`)
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    logger.info('Enhanced CSS conversion data prepared:', {
      nodeType: targetNode.type,
      nodeName: targetNode.name,
      childrenCount: targetNode.children?.length || 0,
    })

    // Create enhanced AI prompt for CSS conversion
    const prompt = createCSSPrompt(optimizedData, context)

    // Call OpenAI API with enhanced error handling
    const cssCode = await callOpenAI(prompt, 'gpt-4o')

    return `/* Generated CSS from Figma design using AI v2.0 */
/* Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components */
${cssCode}`
  } catch (error) {
    logger.error('Error generating CSS with AI:', error)
    // Enhanced fallback with error information
    return generateErrorCSS(
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// New comprehensive HTML with embedded CSS generation
async function generateHTMLWithEmbeddedCSS(
  data: any,
  context: ConversionContext
): Promise<{ html: string; css: string }> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
      // If we found a node but it has a document property, use the document
      if (targetNode?.document) {
        targetNode = targetNode.document
      }
    } else {
      targetNode = data.document
      // If no document at root level, check if there's a document in the first node
      if (!targetNode && data.nodes) {
        const firstNode = Object.values(data.nodes)[0] as any
        if (firstNode?.document) {
          targetNode = firstNode.document
        }
      }
    }

    if (!targetNode) {
      const errorHtml = generateErrorFallback(
        context,
        `Could not find node ${context.nodeId || 'document'} in Figma file`
      )
      return {
        html: errorHtml,
        css: generateErrorCSS(`Could not find node ${context.nodeId || 'document'} in Figma file`),
      }
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    // Validate that we have all major sections
    const sectionNames = extractSectionNames(optimizedData)
    logger.info('Enhanced HTML+CSS conversion data prepared:', {
      nodeType: targetNode.type,
      nodeName: targetNode.name,
      childrenCount: targetNode.children?.length || 0,
      detectedSections: sectionNames,
      totalSections: sectionNames.length,
    })

    // Create comprehensive AI prompt for HTML with embedded CSS
    const prompt = createHTMLWithCSSPrompt(optimizedData, context)

    logger.info('AI prompt created', {
      promptLength: prompt.length,
      promptPreview: `${prompt.substring(0, 500)}...`,
    })

    // Call OpenAI API with enhanced error handling
    const response = await callOpenAI(prompt, 'gpt-4o')

    logger.info('OpenAI response received', {
      responseLength: response.length,
      responsePreview: `${response.substring(0, 200)}...`,
    })

    // Parse the response to extract HTML and CSS
    const { html, css } = parseHTMLCSSResponse(response)

    logger.info('Response parsing completed', {
      htmlLength: html.length,
      cssLength: css.length,
      htmlPreview: `${html.substring(0, 200)}...`,
    })

    return {
      html: `<!-- Generated HTML from Figma file using AI v2.0 -->
<!-- Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components -->
${html}`,
      css: `/* Generated CSS from Figma design using AI v2.0 */
/* Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components */
${css}`,
    }
  } catch (error) {
    logger.error('Error generating HTML with embedded CSS:', error)
    const errorHtml = generateErrorFallback(
      context,
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return {
      html: errorHtml,
      css: generateErrorCSS(
        `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    }
  }
}

// New comprehensive React with embedded CSS generation
async function generateReactWithEmbeddedCSS(
  data: any,
  context: ConversionContext
): Promise<{ component: string; css: string }> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
      // If we found a node but it has a document property, use the document
      if (targetNode?.document) {
        targetNode = targetNode.document
      }
    } else {
      targetNode = data.document
      // If no document at root level, check if there's a document in the first node
      if (!targetNode && data.nodes) {
        const firstNode = Object.values(data.nodes)[0] as any
        if (firstNode?.document) {
          targetNode = firstNode.document
        }
      }
    }

    if (!targetNode) {
      const errorComponent = generateReactErrorFallback(
        context,
        `Could not find node ${context.nodeId || 'document'} in Figma file`
      )
      return {
        component: errorComponent,
        css: generateErrorCSS(`Could not find node ${context.nodeId || 'document'} in Figma file`),
      }
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    logger.info('Enhanced React+CSS conversion data prepared:', {
      nodeType: targetNode.type,
      nodeName: targetNode.name,
      childrenCount: targetNode.children?.length || 0,
    })

    // Create comprehensive AI prompt for React with CSS
    const prompt = createReactWithCSSPrompt(optimizedData, context)

    // Call OpenAI API with enhanced error handling
    const response = await callOpenAI(prompt, 'gpt-4o')

    // Parse the response to extract React component and CSS
    const { component, css } = parseReactCSSResponse(response)

    return {
      component: `import React from 'react';
import './styles.css';

// Generated React component from Figma using AI v2.0
// Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components
${component}`,
      css: `/* Generated CSS from Figma design using AI v2.0 */
/* Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components */
${css}`,
    }
  } catch (error) {
    logger.error('Error generating React with embedded CSS:', error)
    const errorComponent = generateReactErrorFallback(
      context,
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return {
      component: errorComponent,
      css: generateErrorCSS(
        `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    }
  }
}

// New comprehensive Angular with embedded CSS generation
async function generateAngularWithEmbeddedCSS(
  data: any,
  context: ConversionContext
): Promise<{ component: string; css: string }> {
  try {
    // Extract the document or specific node from Figma data
    let targetNode = null

    if (context.nodeId) {
      targetNode = data.nodes?.[context.nodeId]
      if (!targetNode && data.document) {
        targetNode = findNodeById(data.document, context.nodeId)
      }
      // If we found a node but it has a document property, use the document
      if (targetNode?.document) {
        targetNode = targetNode.document
      }
    } else {
      targetNode = data.document
      // If no document at root level, check if there's a document in the first node
      if (!targetNode && data.nodes) {
        const firstNode = Object.values(data.nodes)[0] as any
        if (firstNode?.document) {
          targetNode = firstNode.document
        }
      }
    }

    if (!targetNode) {
      const errorComponent = generateAngularErrorFallback(
        context,
        `Could not find node ${context.nodeId || 'document'} in Figma file`
      )
      return {
        component: errorComponent,
        css: generateErrorCSS(`Could not find node ${context.nodeId || 'document'} in Figma file`),
      }
    }

    // Prepare enhanced Figma data for AI processing
    const optimizedData = optimizeFigmaDataForAI(targetNode, context)

    logger.info('Enhanced Angular+CSS conversion data prepared:', {
      nodeType: targetNode.type,
      nodeName: targetNode.name,
      childrenCount: targetNode.children?.length || 0,
    })

    // Create comprehensive AI prompt for Angular with CSS
    const prompt = createAngularWithCSSPrompt(optimizedData, context)

    // Call OpenAI API with enhanced error handling
    const response = await callOpenAI(prompt, 'gpt-4o')

    // Parse the response to extract Angular component and CSS
    const { component, css } = parseAngularCSSResponse(response)

    return {
      component: `import { Component } from '@angular/core';

// Generated Angular component from Figma using AI v2.0
// Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components
${component}`,
      css: `/* Generated CSS from Figma design using AI v2.0 */
/* Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components */
${css}`,
    }
  } catch (error) {
    logger.error('Error generating Angular with embedded CSS:', error)
    const errorComponent = generateAngularErrorFallback(
      context,
      `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return {
      component: errorComponent,
      css: generateErrorCSS(
        `AI conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    }
  }
}

// Function to clean up OpenAI response by removing excessive newlines
function cleanOpenAIResponse(response: string): string {
  if (!response) return response

  // Replace multiple consecutive newlines with single newlines
  let cleaned = response.replace(/\n{3,}/g, '\n\n')

  // Remove leading and trailing newlines
  cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '')

  // Clean up HTML/CSS specific formatting
  // Remove excessive newlines in CSS blocks
  cleaned = cleaned.replace(/\{\s*\n\s*\n/g, '{\n')
  cleaned = cleaned.replace(/\n\s*\n\s*\}/g, '\n}')

  // Remove excessive newlines in HTML tags
  cleaned = cleaned.replace(/>\s*\n\s*\n\s*</g, '>\n<')

  // Clean up between HTML and CSS sections
  cleaned = cleaned.replace(/HTML:\s*\n\s*\n/g, 'HTML:\n')
  cleaned = cleaned.replace(/CSS:\s*\n\s*\n/g, 'CSS:\n')
  cleaned = cleaned.replace(/COMPONENT:\s*\n\s*\n/g, 'COMPONENT:\n')

  return cleaned
}

// Enhanced OpenAI API call with better error handling and metrics
async function callOpenAI(prompt: string, model = 'gpt-4o', retryCount = 0): Promise<string> {
  const startTime = Date.now()

  try {
    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured')
    }

    // Create cache key from prompt hash
    const cacheKey = createHash('md5').update(prompt).digest('hex')

    // Check cache first
    const cached = aiCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.info('Using cached AI response', {
        cacheKey: cacheKey.substring(0, 8),
        age: Date.now() - cached.timestamp,
      })
      return cached.result
    }

    // Optimize prompt - remove unnecessary whitespace and truncate intelligently
    const optimizedPrompt = optimizePrompt(prompt)

    logger.info('Calling OpenAI API', {
      model,
      promptLength: optimizedPrompt.length,
      retryCount,
    })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(),
          },
          {
            role: 'user',
            content: optimizedPrompt,
          },
        ],
        max_tokens: 16384, // Increased for complete HTML/CSS generation
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // Retry on rate limit or server errors
      if ((response.status === 429 || response.status >= 500) && retryCount < 2) {
        const delay = 2 ** retryCount * 1000 // Exponential backoff
        logger.info(`Retrying OpenAI API call in ${delay}ms (attempt ${retryCount + 1})`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return callOpenAI(prompt, model, retryCount + 1)
      }

      logger.error('OpenAI API error details:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        model,
        retryCount,
      })
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`
      )
    }

    const data = await response.json()
    const rawContent = data.choices[0]?.message?.content || ''
    const tokensUsed = data.usage?.total_tokens || 0

    if (!rawContent) {
      throw new Error('Empty response from OpenAI API')
    }

    // Clean up the response by removing excessive newlines
    const content = cleanOpenAIResponse(rawContent)

    const processingTime = Date.now() - startTime

    // Cache the result with enhanced metadata
    aiCache.set(cacheKey, {
      result: content,
      timestamp: Date.now(),
      metadata: {
        promptHash: cacheKey,
        model,
        tokens: tokensUsed,
        processingTime,
      },
    })

    logger.info('OpenAI API call completed', {
      model,
      tokensUsed,
      processingTime,
      responseLength: content.length,
    })

    return content
  } catch (error) {
    logger.error('OpenAI API call failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      model,
      retryCount,
      processingTime: Date.now() - startTime,
    })
    throw error
  }
}

// Enhanced prompt optimization for better token usage
function optimizePrompt(prompt: string): string {
  const maxPromptLength = 50000 // Significantly increased for complete Figma designs

  if (prompt.length <= maxPromptLength) {
    return prompt
  }

  // Try to truncate at a logical boundary (end of a JSON object)
  const truncated = prompt.substring(0, maxPromptLength)
  const lastBrace = truncated.lastIndexOf('}')
  const lastNewline = truncated.lastIndexOf('\n')

  // Prefer truncating at JSON boundaries
  if (lastBrace > maxPromptLength * 0.8) {
    return (
      truncated.substring(0, lastBrace + 1) +
      '\n\n[Content truncated due to length - design data optimized for AI processing]'
    )
  }

  // Fallback to newline boundaries
  if (lastNewline > maxPromptLength * 0.8) {
    return (
      truncated.substring(0, lastNewline) +
      '\n\n[Content truncated due to length - design data optimized for AI processing]'
    )
  }

  return `${truncated}\n\n[Content truncated due to length - design data optimized for AI processing]`
}

// Enhanced system prompt for better AI understanding
function getSystemPrompt(): string {
  return `You are an expert frontend developer and design system specialist who specializes in converting Figma design data to clean, semantic, and accessible code. 

CRITICAL REQUIREMENT: You must process ALL sections and components in the Figma design. The design contains multiple major sections that must ALL be included in your HTML output:

1. Hero/Banner sections (may have multiple variants)
2. Statistics/Features sections with percentages and metrics  
3. Feature grids with problem/solution items
4. Data tables with multiple columns
5. Expert/Team sections with profiles
6. Form sections with input fields
7. Footer sections

Do NOT skip any sections. Include every text element, button, input field, image, and layout component you find in the design.

Your expertise includes:
- Modern HTML5 semantic structure
- CSS Grid and Flexbox layouts
- Responsive design principles
- Accessibility best practices (WCAG 2.1)
- Component-based architecture
- Design system patterns
- Performance optimization

Guidelines:
- Always return only the requested code without explanations or markdown formatting
- Use semantic HTML elements (header, nav, main, section, article, aside, footer)
- Include proper ARIA attributes for accessibility
- Generate clean, maintainable code
- Use CSS custom properties for design tokens
- Implement responsive design with mobile-first approach
- Follow modern CSS best practices
- Create reusable component patterns
- Optimize for performance and maintainability
- Process EVERY element in the design hierarchy - do not skip any children or nested elements
- Use the exact colors provided in the Figma data (hex and rgba values are included)
- Preserve all text content exactly as shown in the design
- Include all visual elements, shapes, and components from the design
- Maintain the exact layout structure and positioning from Figma

IMPORTANT: When generating HTML+CSS responses, format them exactly as:
HTML:
[Complete HTML document with embedded styles]

CSS:
[Additional CSS if needed]

When generating React+CSS responses, format them exactly as:
COMPONENT:
[React component code]

CSS:
[CSS styles]

When generating Angular+CSS responses, format them exactly as:
COMPONENT:
[Angular component code]

CSS:
[CSS styles]

Always follow the exact format specified in the prompt.`
}

// Enhanced Figma data optimization for AI processing
function optimizeFigmaDataForAI(node: any, context: ConversionContext): any {
  if (!node) return null

  // Create a comprehensive but optimized version of the node
  const optimized: any = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
  }

  // Add layout information with enhanced details
  if (node.absoluteBoundingBox) {
    optimized.absoluteBoundingBox = {
      x: Math.round(node.absoluteBoundingBox.x),
      y: Math.round(node.absoluteBoundingBox.y),
      width: Math.round(node.absoluteBoundingBox.width),
      height: Math.round(node.absoluteBoundingBox.height),
    }
  }

  // Add layout mode information for better AI understanding
  if (node.layoutMode) {
    optimized.layoutMode = node.layoutMode
    optimized.primaryAxisAlignItems = node.primaryAxisAlignItems
    optimized.counterAxisAlignItems = node.counterAxisAlignItems
    optimized.itemSpacing = node.itemSpacing
  }

  // Add padding information
  if (node.paddingLeft || node.paddingRight || node.paddingTop || node.paddingBottom) {
    optimized.padding = {
      left: node.paddingLeft || 0,
      right: node.paddingRight || 0,
      top: node.paddingTop || 0,
      bottom: node.paddingBottom || 0,
    }
  }

  // Add enhanced styling information with precise color values
  if (node.fills && node.fills.length > 0) {
    optimized.fills = node.fills.map((fill: any) => ({
      type: fill.type,
      color: fill.color
        ? {
            r: fill.color.r, // Keep precise values for accurate color reproduction
            g: fill.color.g,
            b: fill.color.b,
            a: fill.color.a,
            // Add hex and rgba representations for easier AI processing
            hex: `#${Math.round(fill.color.r * 255)
              .toString(16)
              .padStart(2, '0')}${Math.round(fill.color.g * 255)
              .toString(16)
              .padStart(2, '0')}${Math.round(fill.color.b * 255)
              .toString(16)
              .padStart(2, '0')}`,
            rgba: `rgba(${Math.round(fill.color.r * 255)}, ${Math.round(fill.color.g * 255)}, ${Math.round(fill.color.b * 255)}, ${fill.color.a})`,
          }
        : undefined,
      gradientStops: fill.gradientStops?.map((stop: any) => ({
        color: {
          r: stop.color.r,
          g: stop.color.g,
          b: stop.color.b,
          a: stop.color.a,
          hex: `#${Math.round(stop.color.r * 255)
            .toString(16)
            .padStart(2, '0')}${Math.round(stop.color.g * 255)
            .toString(16)
            .padStart(2, '0')}${Math.round(stop.color.b * 255)
            .toString(16)
            .padStart(2, '0')}`,
          rgba: `rgba(${Math.round(stop.color.r * 255)}, ${Math.round(stop.color.g * 255)}, ${Math.round(stop.color.b * 255)}, ${stop.color.a})`,
        },
        position: stop.position,
      })),
    }))
  }

  // Add stroke information with precise color values
  if (node.strokes && node.strokes.length > 0) {
    optimized.strokes = node.strokes.map((stroke: any) => ({
      type: stroke.type,
      color: stroke.color
        ? {
            r: stroke.color.r, // Keep precise values for accurate color reproduction
            g: stroke.color.g,
            b: stroke.color.b,
            a: stroke.color.a,
            // Add hex and rgba representations for easier AI processing
            hex: `#${Math.round(stroke.color.r * 255)
              .toString(16)
              .padStart(2, '0')}${Math.round(stroke.color.g * 255)
              .toString(16)
              .padStart(2, '0')}${Math.round(stroke.color.b * 255)
              .toString(16)
              .padStart(2, '0')}`,
            rgba: `rgba(${Math.round(stroke.color.r * 255)}, ${Math.round(stroke.color.g * 255)}, ${Math.round(stroke.color.b * 255)}, ${stroke.color.a})`,
          }
        : undefined,
      strokeWeight: stroke.strokeWeight,
    }))
  }

  // Add text information with enhanced details
  if (node.characters) {
    optimized.characters = node.characters
  }

  if (node.style) {
    optimized.style = {
      fontSize: node.style.fontSize,
      fontFamily: node.style.fontFamily,
      fontPostScriptName: node.style.fontPostScriptName,
      fontStyle: node.style.fontStyle,
      fontWeight: node.style.fontWeight,
      textCase: node.style.textCase,
      textAutoResize: node.style.textAutoResize,
      textAlignHorizontal: node.style.textAlignHorizontal,
      textAlignVertical: node.style.textAlignVertical,
      letterSpacing: node.style.letterSpacing,
      lineHeightPx: node.style.lineHeightPx,
      lineHeightPercent: node.style.lineHeightPercent,
      lineHeightPercentFontSize: node.style.lineHeightPercentFontSize,
      lineHeightUnit: node.style.lineHeightUnit,
      // Add text color information
      fills: node.style.fills?.map((fill: any) => ({
        type: fill.type,
        color: fill.color
          ? {
              r: fill.color.r,
              g: fill.color.g,
              b: fill.color.b,
              a: fill.color.a,
              hex: `#${Math.round(fill.color.r * 255)
                .toString(16)
                .padStart(2, '0')}${Math.round(fill.color.g * 255)
                .toString(16)
                .padStart(2, '0')}${Math.round(fill.color.b * 255)
                .toString(16)
                .padStart(2, '0')}`,
              rgba: `rgba(${Math.round(fill.color.r * 255)}, ${Math.round(fill.color.g * 255)}, ${Math.round(fill.color.b * 255)}, ${fill.color.a})`,
            }
          : undefined,
      })),
    }
  }

  // Add design variables/tokens information
  if (node.boundVariables) {
    optimized.boundVariables = node.boundVariables
  }

  // Add component properties for instances
  if (node.componentProperties) {
    optimized.componentProperties = node.componentProperties
  }

  // Add layout mode and alignment information
  if (node.layoutMode) {
    optimized.layoutMode = node.layoutMode
    optimized.primaryAxisAlignItems = node.primaryAxisAlignItems
    optimized.counterAxisAlignItems = node.counterAxisAlignItems
    optimized.primaryAxisSizingMode = node.primaryAxisSizingMode
    optimized.counterAxisSizingMode = node.counterAxisSizingMode
  }

  // Add corner radius and effects
  if (node.cornerRadius) {
    optimized.cornerRadius = node.cornerRadius
  }

  if (node.effects && node.effects.length > 0) {
    optimized.effects = node.effects.map((effect: any) => ({
      type: effect.type,
      radius: effect.radius,
      color: effect.color
        ? {
            r: Math.round(effect.color.r * 100) / 100,
            g: Math.round(effect.color.g * 100) / 100,
            b: Math.round(effect.color.b * 100) / 100,
            a: Math.round(effect.color.a * 100) / 100,
          }
        : undefined,
      offset: effect.offset,
    }))
  }

  // Add constraints information
  if (node.constraints) {
    optimized.constraints = node.constraints
  }

  // Recursively optimize children (process ALL children for complete design)
  if (node.children && node.children.length > 0) {
    // Process ALL children to capture complete design hierarchy
    optimized.children = node.children.map((child: any) => optimizeFigmaDataForAI(child, context))
  }

  return optimized
}

// Helper functions for debugging and analysis
function countAllChildren(node: any): number {
  if (!node || !node.children) return 0
  let count = node.children.length
  for (const child of node.children) {
    count += countAllChildren(child)
  }
  return count
}

function extractSectionNames(node: any): string[] {
  const sections: string[] = []

  function traverse(n: any) {
    if (!n) return

    // Add section names that indicate major design sections
    if (
      n.name &&
      (n.name.toLowerCase().includes('banner') ||
        n.name.toLowerCase().includes('hero') ||
        n.name.toLowerCase().includes('section') ||
        n.name.toLowerCase().includes('statistics') ||
        n.name.toLowerCase().includes('feature') ||
        n.name.toLowerCase().includes('table') ||
        n.name.toLowerCase().includes('form') ||
        n.name.toLowerCase().includes('footer') ||
        n.name.toLowerCase().includes('header') ||
        n.name.toLowerCase().includes('nav') ||
        n.name.toLowerCase().includes('grid') ||
        n.name.toLowerCase().includes('container'))
    ) {
      sections.push(n.name)
    }

    if (n.children) {
      for (const child of n.children) {
        traverse(child)
      }
    }
  }

  traverse(node)
  return sections
}

function hasTextElements(node: any): boolean {
  if (!node) return false
  if (node.type === 'TEXT' && node.characters) return true
  if (node.children) {
    return node.children.some((child: any) => hasTextElements(child))
  }
  return false
}

function hasImageElements(node: any): boolean {
  if (!node) return false
  if (node.type === 'RECTANGLE' && node.fills?.some((fill: any) => fill.type === 'IMAGE'))
    return true
  if (node.children) {
    return node.children.some((child: any) => hasImageElements(child))
  }
  return false
}

function getNodeTypes(node: any): string[] {
  if (!node) return []
  const types = new Set<string>()

  function collectTypes(n: any) {
    if (n.type) types.add(n.type)
    if (n.children) {
      n.children.forEach((child: any) => collectTypes(child))
    }
  }

  collectTypes(node)
  return Array.from(types)
}

// Enhanced prompt creation functions
function createHTMLPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Convert this complete Figma design data to clean, semantic HTML5 with modern CSS. Process ALL elements in the design hierarchy, not just the top-level elements.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Process the ENTIRE design hierarchy including all nested children, text elements, shapes, and components
- Generate semantic HTML5 structure with proper document outline
- Use appropriate HTML elements (header, nav, main, section, article, aside, footer, button, input, etc.)
- Include comprehensive accessibility attributes (ARIA labels, roles, etc.)
- Implement responsive design with CSS Grid and Flexbox
- Use CSS custom properties for design tokens
- Include proper focus management and keyboard navigation
- Generate clean, maintainable code with comments
- ${context.responsive ? 'Make it mobile-first responsive with breakpoints' : 'Use fixed dimensions'}
- Include hover states and interactive elements
- Optimize for performance and SEO
- Create a complete, functional webpage that represents the full design
- Ensure all text content, images, and interactive elements are properly included

IMPORTANT: Analyze the complete structure and create a comprehensive HTML document that includes all visible elements from the design, not just a basic banner.

Return only the HTML code without any explanations or markdown formatting.`
}

function createReactPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Convert this Figma design data to a modern React functional component with TypeScript.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Generate a modern React functional component with TypeScript
- Include proper TypeScript interfaces for props and state
- Use semantic HTML elements with React best practices
- Include comprehensive accessibility attributes
- Implement responsive design with CSS-in-JS or CSS modules
- Use React hooks for state management if needed
- Include proper event handling and form validation
- Generate reusable component patterns
- ${context.responsive ? 'Make it mobile-first responsive' : 'Use fixed dimensions'}
- Include proper error boundaries and loading states
- Optimize for performance with React.memo if appropriate

Return only the React component code without any explanations or markdown formatting.`
}

function createAngularPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Convert this Figma design data to a modern Angular component with TypeScript.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Generate a modern Angular component with TypeScript
- Use Angular template syntax and component architecture
- Include proper TypeScript interfaces and services
- Use semantic HTML elements with Angular best practices
- Include comprehensive accessibility attributes
- Implement responsive design with Angular Material or custom CSS
- Use Angular forms and reactive forms if needed
- Include proper change detection and lifecycle hooks
- Generate reusable component patterns
- ${context.responsive ? 'Make it mobile-first responsive' : 'Use fixed dimensions'}
- Include proper error handling and loading states
- Optimize for performance with OnPush change detection

Return only the Angular component code without any explanations or markdown formatting.`
}

function createCSSPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Generate modern, comprehensive CSS styles for this Figma design data.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Generate clean, modern CSS with CSS Grid and Flexbox
- Use CSS custom properties (variables) for design tokens
- Implement comprehensive responsive design with mobile-first approach
- Include hover states, focus states, and transitions
- Use semantic class names following BEM methodology
- Include proper typography and spacing systems
- Add accessibility considerations (focus indicators, etc.)
- ${context.responsive ? 'Make it mobile-first responsive with breakpoints' : 'Use fixed dimensions'}
- Include CSS animations and micro-interactions
- Optimize for performance and maintainability
- Use modern CSS features (custom properties, calc(), etc.)

Return only the CSS code without any explanations or markdown formatting.`
}

// New comprehensive prompt functions for HTML+CSS, React+CSS, and Angular+CSS
function createHTMLWithCSSPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Convert this complete Figma design data to a complete HTML document with embedded CSS. Generate a complete, functional webpage.

CRITICAL REQUIREMENT: You must process ALL sections and components in the Figma design. The design contains multiple major sections that must ALL be included in your HTML output:

1. Hero/Banner sections (may have multiple variants like "banner-new", "banner-old")
2. Statistics/Features sections with percentages and metrics (like "statistics" section)
3. Feature grids with problem/solution items (like "Section-feature-grid")
4. Data tables with multiple columns
5. Expert/Team sections with profiles
6. Form sections with input fields
7. Footer sections
8. Navigation and header elements
9. All text content, buttons, and interactive elements

MANDATORY: You MUST include EVERY section found in the design. Do NOT skip any sections, even if they seem similar. Each section serves a different purpose and must be included.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Generate a complete HTML5 document with DOCTYPE, html, head, and body tags
- Include all CSS styles in a <style> tag in the head section
- Process the ENTIRE design hierarchy including ALL nested children, text elements, shapes, and components
- Use semantic HTML5 elements (header, nav, main, section, article, aside, footer, button, input, etc.)
- Include comprehensive accessibility attributes (ARIA labels, roles, etc.)
- Implement responsive design with CSS Grid and Flexbox
- Use CSS custom properties for design tokens
- Include proper focus management and keyboard navigation
- Generate clean, maintainable code with comments
- ${context.responsive ? 'Make it mobile-first responsive with breakpoints' : 'Use fixed dimensions'}
- Include hover states and interactive elements
- Optimize for performance and SEO
- Create a complete, functional webpage that represents the full design
- Ensure ALL text content, images, and interactive elements are properly included
- Use EXACT colors from the design (hex values provided in the data)
- Preserve ALL text content exactly as shown in the design
- Include ALL visual elements, shapes, and components from the design
- Maintain the exact layout structure and positioning from Figma
- Process ALL children recursively - do not truncate or skip any part of the design
- Include all text elements with their exact content and styling
- Include all buttons, inputs, and interactive elements
- Include all images and visual elements
- Include all layout containers and their contents

IMPORTANT: Return a complete HTML document with embedded CSS. Format your response as:

HTML:
<!DOCTYPE html>
<html>
<head>
  <style>
    /* CSS styles here */
  </style>
</head>
<body>
  <!-- HTML content here -->
</body>
</html>

CSS:
/* Additional CSS if needed */

Return only the HTML and CSS code without any explanations or markdown formatting.`
}

function createReactWithCSSPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Convert this Figma design data to a modern React functional component with TypeScript and corresponding CSS.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Generate a modern React functional component with TypeScript
- Include proper TypeScript interfaces for props and state
- Use semantic HTML elements with React best practices
- Include comprehensive accessibility attributes
- Implement responsive design with CSS
- Use React hooks for state management if needed
- Include proper event handling and form validation
- Generate reusable component patterns
- ${context.responsive ? 'Make it mobile-first responsive' : 'Use fixed dimensions'}
- Include proper error boundaries and loading states
- Optimize for performance with React.memo if appropriate

IMPORTANT: Format your response as:

COMPONENT:
// React component code here

CSS:
/* CSS styles here */

Return only the React component and CSS code without any explanations or markdown formatting.`
}

function createAngularWithCSSPrompt(optimizedData: any, context: ConversionContext): string {
  const designSystem = context.designSystem
  const figmaData = JSON.stringify(optimizedData, null, 2)

  return `Convert this Figma design data to a modern Angular component with TypeScript and corresponding CSS.

Figma Design Data:
${figmaData}

Design System Context:
- Colors: ${designSystem?.colors.join(', ') || 'None detected'}
- Typography: ${designSystem?.typography.join(', ') || 'None detected'}
- Spacing: ${designSystem?.spacing.join(', ') || 'None detected'}
- Components: ${designSystem?.components.join(', ') || 'None detected'}
- Design Variables: ${designSystem?.designVariables?.length || 0} design tokens detected

Requirements:
- Generate a modern Angular component with TypeScript
- Use Angular template syntax and component architecture
- Include proper TypeScript interfaces and services
- Use semantic HTML elements with Angular best practices
- Include comprehensive accessibility attributes
- Implement responsive design with CSS
- Use Angular forms and reactive forms if needed
- Include proper change detection and lifecycle hooks
- Generate reusable component patterns
- ${context.responsive ? 'Make it mobile-first responsive' : 'Use fixed dimensions'}
- Include proper error handling and loading states
- Optimize for performance with OnPush change detection

IMPORTANT: Format your response as:

COMPONENT:
// Angular component code here

CSS:
/* CSS styles here */

Return only the Angular component and CSS code without any explanations or markdown formatting.`
}

// Response parsing functions
function parseHTMLCSSResponse(response: string): { html: string; css: string } {
  // First try to find explicit HTML and CSS sections
  const htmlMatch = response.match(/HTML:\s*([\s\S]*?)(?=CSS:|$)/i)
  const cssMatch = response.match(/CSS:\s*([\s\S]*?)$/i)

  let html = htmlMatch ? htmlMatch[1].trim() : ''
  let css = cssMatch ? cssMatch[1].trim() : ''

  // If no explicit sections found, try to extract HTML and CSS from the response
  if (!htmlMatch && !cssMatch) {
    // Look for complete HTML document structure
    const htmlStart = response.search(/<!DOCTYPE|<html/i)
    if (htmlStart !== -1) {
      // Find the end of the HTML document
      const htmlEnd = response.lastIndexOf('</html>')
      if (htmlEnd !== -1) {
        html = response.substring(htmlStart, htmlEnd + 7).trim()
      } else {
        html = response.substring(htmlStart).trim()
      }
    } else {
      // Look for body content
      const bodyStart = response.search(/<body/i)
      if (bodyStart !== -1) {
        const bodyEnd = response.lastIndexOf('</body>')
        if (bodyEnd !== -1) {
          html = response.substring(bodyStart, bodyEnd + 7).trim()
        } else {
          html = response.substring(bodyStart).trim()
        }
      } else {
        html = response
      }
    }

    // Look for CSS in style tags
    const styleMatch = response.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
    if (styleMatch) {
      css = styleMatch[1].trim()
    } else {
      // Look for standalone CSS
      const cssStart = response.search(/\*[\s\S]*?\{|\.\w+|#\w+/)
      if (cssStart !== -1) {
        css = response.substring(cssStart).trim()
      }
    }
  }

  // Ensure we have valid HTML structure
  if (html && !html.includes('<!DOCTYPE') && !html.includes('<html')) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Figma Design</title>
    <style>
        ${css}
    </style>
</head>
<body>
    ${html}
</body>
</html>`
    css = ''
  }

  return { html, css }
}

function parseReactCSSResponse(response: string): { component: string; css: string } {
  const componentMatch = response.match(/COMPONENT:\s*([\s\S]*?)(?=CSS:|$)/i)
  const cssMatch = response.match(/CSS:\s*([\s\S]*?)$/i)

  let component = componentMatch ? componentMatch[1].trim() : response
  const css = cssMatch ? cssMatch[1].trim() : ''

  // If no explicit sections found, try to extract React component and CSS
  if (!componentMatch && !cssMatch) {
    // Look for React component structure
    const componentStart = response.search(/import React|const \w+|function \w+|export/i)
    if (componentStart !== -1) {
      component = response.substring(componentStart).trim()
    } else {
      component = response
    }
  }

  return { component, css }
}

function parseAngularCSSResponse(response: string): { component: string; css: string } {
  const componentMatch = response.match(/COMPONENT:\s*([\s\S]*?)(?=CSS:|$)/i)
  const cssMatch = response.match(/CSS:\s*([\s\S]*?)$/i)

  let component = componentMatch ? componentMatch[1].trim() : response
  const css = cssMatch ? cssMatch[1].trim() : ''

  // If no explicit sections found, try to extract Angular component and CSS
  if (!componentMatch && !cssMatch) {
    // Look for Angular component structure
    const componentStart = response.search(/import.*Component|@Component|export class/i)
    if (componentStart !== -1) {
      component = response.substring(componentStart).trim()
    } else {
      component = response
    }
  }

  return { component, css }
}

// Enhanced error handling functions
function generateErrorFallback(context: ConversionContext, errorMessage: string): string {
  return `<!-- Error in Figma conversion -->
<div class="figma-error" role="alert" aria-live="polite">
  <div class="error-content">
    <h2>Conversion Error</h2>
    <p><strong>Error:</strong> ${errorMessage}</p>
    <p><strong>File:</strong> ${context.fileKey}</p>
    <p><strong>Node:</strong> ${context.nodeId || 'Document'}</p>
    <p><strong>Format:</strong> ${context.outputFormat}</p>
    <details>
      <summary>Debug Information</summary>
      <p>This error occurred during the Figma to ${context.outputFormat.toUpperCase()} conversion process. Please check the file key and node ID, and ensure the Figma file is accessible.</p>
    </details>
  </div>
</div>`
}

function generateReactErrorFallback(context: ConversionContext, errorMessage: string): string {
  return `import React from 'react';

interface ErrorProps {
  error: string;
  fileKey: string;
  nodeId?: string;
  format: string;
}

const FigmaErrorComponent: React.FC<ErrorProps> = ({ error, fileKey, nodeId, format }) => {
  return (
    <div className="figma-error" role="alert" aria-live="polite">
      <div className="error-content">
        <h2>Conversion Error</h2>
        <p><strong>Error:</strong> {error}</p>
        <p><strong>File:</strong> {fileKey}</p>
        <p><strong>Node:</strong> {nodeId || 'Document'}</p>
        <p><strong>Format:</strong> {format}</p>
        <details>
          <summary>Debug Information</summary>
          <p>This error occurred during the Figma to {format.toUpperCase()} conversion process.</p>
        </details>
      </div>
    </div>
  );
};

export default FigmaErrorComponent;`
}

function generateAngularErrorFallback(context: ConversionContext, errorMessage: string): string {
  return `import { Component } from '@angular/core';

@Component({
  selector: 'app-figma-error',
  template: \`
    <div class="figma-error" role="alert" aria-live="polite">
      <div class="error-content">
        <h2>Conversion Error</h2>
        <p><strong>Error:</strong> ${errorMessage}</p>
        <p><strong>File:</strong> ${context.fileKey}</p>
        <p><strong>Node:</strong> ${context.nodeId || 'Document'}</p>
        <p><strong>Format:</strong> ${context.outputFormat}</p>
        <details>
          <summary>Debug Information</summary>
          <p>This error occurred during the Figma to ${context.outputFormat.toUpperCase()} conversion process.</p>
        </details>
      </div>
    </div>
  \`,
  styleUrls: ['./figma-error.component.css']
})
export class FigmaErrorComponent {
  // Component logic here
}`
}

function generateErrorCSS(errorMessage: string): string {
  return `.figma-error {
  color: #dc2626;
  padding: 1rem;
  border: 1px solid #dc2626;
  border-radius: 0.5rem;
  background-color: #fef2f2;
  margin: 1rem 0;
}

.error-content h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.error-content p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
}

.error-content details {
  margin-top: 0.5rem;
}

.error-content summary {
  cursor: pointer;
  font-weight: 500;
}

.error-content summary:hover {
  text-decoration: underline;
}`
}

// Enhanced fallback functions with design system context
function generateHTMLWithDesignSystem(data: any, context: ConversionContext): string {
  const html = generateHTML(data, context.nodeId, context.responsive)
  return `<!-- Generated HTML from Figma file using enhanced fallback -->
<!-- Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components -->
${html}`
}

function generateCSSWithDesignSystem(data: any, context: ConversionContext): string {
  const css = generateCSS(data, context.nodeId, context.responsive)
  return `/* Generated CSS from Figma design using enhanced fallback */
/* Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components */
${css}`
}

function generateReactWithDesignSystem(data: any, context: ConversionContext): string {
  const react = generateReact(data, context.nodeId, context.responsive)
  return `import React from 'react';
import './styles.css';

// Generated React component from Figma using enhanced fallback
// Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components
${react}`
}

function generateAngularWithDesignSystem(data: any, context: ConversionContext): string {
  const angular = generateAngular(data, context.nodeId, context.responsive)
  return `import { Component } from '@angular/core';

// Generated Angular component from Figma using enhanced fallback
// Design System: ${context.designSystem?.colors.length || 0} colors, ${context.designSystem?.components.length || 0} components
${angular}`
}

// Enhanced fallback functions for code generation
function generateHTML(data: any, nodeId?: string, responsive = true): string {
  try {
    logger.info('Enhanced HTML generation called', {
      hasData: !!data,
      dataKeys: Object.keys(data || {}),
      nodeId,
      responsive,
    })

    // Extract the document or specific node from Figma data
    let targetNode = null

    if (nodeId) {
      logger.info('Searching for specific node', {
        nodeId,
        availableNodeIds: Object.keys(data.nodes || {}).slice(0, 10),
        totalNodes: Object.keys(data.nodes || {}).length,
      })

      // Enhanced node ID resolution with multiple strategies
      const searchStrategies = [
        // Strategy 1: Exact match
        nodeId,
        // Strategy 2: Dash to colon conversion (most common)
        nodeId.includes('-') ? nodeId.replace(/-/g, ':') : null,
        // Strategy 3: Colon to dash conversion
        nodeId.includes(':') ? nodeId.replace(/:/g, '-') : null,
        // Strategy 4: Try with leading zeros (sometimes Figma adds them)
        nodeId.includes('-')
          ? nodeId.replace(
              /(\d+)-(\d+)/,
              (match, p1, p2) => `${p1.padStart(3, '0')}:${p2.padStart(3, '0')}`
            )
          : null,
        // Strategy 5: Try without leading zeros
        nodeId.includes(':')
          ? nodeId.replace(
              /(\d+):(\d+)/,
              (match, p1, p2) => `${Number.parseInt(p1)}:${Number.parseInt(p2)}`
            )
          : null,
      ].filter(Boolean)

      // Try each strategy
      for (const strategy of searchStrategies) {
        if (strategy && data.nodes?.[strategy]) {
          targetNode = data.nodes[strategy]
          logger.info('Found node using strategy', {
            strategy,
            nodeType: targetNode.type,
            nodeName: targetNode.name,
          })
          break
        }
      }

      // If still not found in data.nodes, search recursively in the document tree
      if (!targetNode && data.document) {
        logger.info('Searching in document tree')

        for (const strategy of searchStrategies) {
          if (strategy) {
            targetNode = findNodeById(data.document, strategy)
            if (targetNode) {
              logger.info('Found node in document tree', {
                strategy,
                nodeType: targetNode.type,
                nodeName: targetNode.name,
              })
              break
            }
          }
        }
      }

      logger.info('Node search completed', {
        originalNodeId: nodeId,
        strategiesTried: searchStrategies,
        foundInNodes: !!targetNode,
        availableNodeIds: Object.keys(data.nodes || {}).slice(0, 10),
        documentChildren: data.document?.children?.length || 0,
        allDocumentNodeIds: data.document ? getAllNodeIds(data.document).slice(0, 10) : [],
      })
    } else {
      targetNode = data.document
    }

    logger.info('Target node identified', {
      hasTargetNode: !!targetNode,
      targetNodeType: targetNode?.type,
      targetNodeName: targetNode?.name,
      targetNodeId: targetNode?.id,
      hasChildren: !!targetNode?.children,
      childrenCount: targetNode?.children?.length || 0,
    })

    if (!targetNode) {
      logger.warn('No target node found, falling back to document')
      // Fallback to the entire document if specific node not found
      targetNode = data.document

      if (!targetNode) {
        const availableNodes = Object.keys(data.nodes || {})
        const documentNodes = data.document ? getAllNodeIds(data.document) : []
        const allNodes = [...new Set([...availableNodes, ...documentNodes])]

        // Generate helpful suggestions
        const suggestions = []
        if (nodeId?.includes('-')) {
          suggestions.push(`Try: ${nodeId.replace(/-/g, ':')}`)
        }
        if (nodeId?.includes(':')) {
          suggestions.push(`Try: ${nodeId.replace(/:/g, '-')}`)
        }

        // Find similar node IDs
        const similarNodes = allNodes
          .filter(
            (id) =>
              id.includes(nodeId?.split(/[-:]/)[0] || '') ||
              id.includes(nodeId?.split(/[-:]/)[1] || '')
          )
          .slice(0, 5)

        return `<!-- Error: Could not find node ${nodeId || 'document'} in Figma file -->
<div class="figma-error" role="alert" aria-live="polite">
  <div class="error-content">
    <h2>Node Not Found</h2>
    <p>Error: Could not extract content from Figma file.</p>
    <p><strong>Searched for:</strong> ${nodeId || 'document'}</p>
    ${suggestions.length > 0 ? `<p><strong>Suggestions:</strong> ${suggestions.join(', ')}</p>` : ''}
    ${similarNodes.length > 0 ? `<p><strong>Similar nodes found:</strong> ${similarNodes.join(', ')}</p>` : ''}
    <p><strong>Available nodes:</strong> ${allNodes.slice(0, 10).join(', ')}${allNodes.length > 10 ? '...' : ''}</p>
    <details>
      <summary>Debug Information</summary>
      <p><strong>Total nodes:</strong> ${allNodes.length}</p>
      <p><strong>Node ID format:</strong> Figma uses colons (:) as separators, not dashes (-)</p>
      <p><strong>Example:</strong> If you have "16-105", try "16:105"</p>
      <p><strong>Note:</strong> Node IDs are case-sensitive and must match exactly</p>
    </details>
  </div>
</div>`
      }
    }

    // Generate HTML from Figma node structure
    const htmlContent = convertFigmaNodeToHTML(targetNode, responsive)

    logger.info('HTML generation completed', {
      contentLength: htmlContent.length,
      responsive,
    })

    return `<!-- Generated HTML from Figma file using enhanced fallback -->
<div class="figma-container" ${responsive ? 'style="max-width: 100%; overflow-x: auto;"' : ''}>
  ${htmlContent}
</div>`
  } catch (error) {
    logger.error('Error in enhanced HTML generation:', error)
    return `<!-- Error generating HTML from Figma -->
<div class="figma-error" role="alert" aria-live="polite">
  <div class="error-content">
    <h2>Generation Error</h2>
    <p>Error converting Figma design to HTML: ${error instanceof Error ? error.message : 'Unknown error'}</p>
  </div>
</div>`
  }
}

// Enhanced Figma node to HTML conversion
function convertFigmaNodeToHTML(node: any, responsive = true): string {
  if (!node) return ''

  // Handle different node types with enhanced logic
  switch (node.type) {
    case 'DOCUMENT':
      return convertDocumentNode(node, responsive)
    case 'PAGE':
      return convertPageNode(node, responsive)
    case 'FRAME':
    case 'GROUP':
      return convertFrameNode(node, responsive)
    case 'RECTANGLE':
      return convertRectangleNode(node, responsive)
    case 'TEXT':
      return convertTextNode(node, responsive)
    case 'VECTOR':
      return convertVectorNode(node, responsive)
    case 'COMPONENT':
    case 'INSTANCE':
      return convertComponentNode(node, responsive)
    default:
      return convertGenericNode(node, responsive)
  }
}

// Enhanced node conversion functions
function convertDocumentNode(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToHTML(child, responsive)).join('\n') || ''
  return `<div class="figma-document" data-name="${node.name || 'Document'}" role="main">\n${children}\n</div>`
}

function convertPageNode(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToHTML(child, responsive)).join('\n') || ''
  return `<div class="figma-page" data-name="${node.name || 'Page'}">\n${children}\n</div>`
}

function convertFrameNode(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToHTML(child, responsive)).join('\n') || ''
  const bounds = node.absoluteBoundingBox
  const styles = bounds
    ? `style="width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;"`
    : ''
  return `<div class="figma-frame" data-name="${node.name || 'Frame'}" ${styles}>\n${children}\n</div>`
}

function convertRectangleNode(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  const fills = node.fills?.[0]
  const cornerRadius = node.cornerRadius || 0

  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }
  if (cornerRadius) {
    styles += ` border-radius: ${cornerRadius}px;`
  }
  if (fills?.color) {
    const color = fills.color
    styles += ` background-color: rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1});`
  }

  return `<div class="figma-rectangle" data-name="${node.name || 'Rectangle'}" style="${styles}" role="img" aria-label="${node.name || 'Rectangle'}"></div>`
}

function convertTextNode(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  const text = node.characters || ''
  const style = node.style || {}

  let styles = ''
  if (bounds) {
    styles += `position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }
  if (style.fontSize) {
    styles += ` font-size: ${style.fontSize}px;`
  }
  if (style.fontFamily) {
    styles += ` font-family: "${style.fontFamily}";`
  }
  if (style.textAlignHorizontal) {
    styles += ` text-align: ${style.textAlignHorizontal.toLowerCase()};`
  }
  if (style.fills?.[0]?.color) {
    const color = style.fills[0].color
    styles += ` color: rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1});`
  }

  return `<p class="figma-text" data-name="${node.name || 'Text'}" style="${styles}">${text}</p>`
}

function convertVectorNode(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }

  return `<div class="figma-vector" data-name="${node.name || 'Vector'}" style="${styles}" role="img" aria-label="${node.name || 'Vector'}">
    <svg width="${bounds?.width || 0}" height="${bounds?.height || 0}" viewBox="0 0 ${bounds?.width || 0} ${bounds?.height || 0}">
      <rect width="100%" height="100%" fill="currentColor" opacity="0.1"/>
    </svg>
  </div>`
}

function convertComponentNode(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToHTML(child, responsive)).join('\n') || ''
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }

  return `<div class="figma-component" data-name="${node.name || 'Component'}" style="${styles}">\n${children}\n</div>`
}

function convertGenericNode(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToHTML(child, responsive)).join('\n') || ''
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }

  return `<div class="figma-${node.type?.toLowerCase() || 'node'}" data-name="${node.name || 'Node'}" style="${styles}">\n${children}\n</div>`
}

// Enhanced React fallback function
function generateReact(data: any, nodeId?: string, responsive = true): string {
  try {
    const targetNode = nodeId ? data.nodes?.[nodeId] : data.document

    if (!targetNode) {
      return `import React from 'react';

const FigmaComponent = () => {
  return (
    <div className="figma-error" role="alert" aria-live="polite">
      <div className="error-content">
        <h2>Conversion Error</h2>
        <p>Error: Could not extract content from Figma file</p>
      </div>
    </div>
  );
};

export default FigmaComponent;`
    }

    const reactContent = convertFigmaNodeToReact(targetNode, responsive)
    const responsiveStyle = responsive ? 'style={{maxWidth: "100%", overflowX: "auto"}}' : ''

    return `import React from 'react';
import './styles.css';

const FigmaComponent = () => {
  return (
    <div className="figma-container" ${responsiveStyle}>
      ${reactContent}
    </div>
  );
};

export default FigmaComponent;`
  } catch (error) {
    return `import React from 'react';

const FigmaComponent = () => {
  return (
    <div className="figma-error" role="alert" aria-live="polite">
      <div className="error-content">
        <h2>Generation Error</h2>
        <p>Error converting Figma design to React: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    </div>
  );
};

export default FigmaComponent;`
  }
}

// Enhanced Angular fallback function
function generateAngular(data: any, nodeId?: string, responsive = true): string {
  try {
    const targetNode = nodeId ? data.nodes?.[nodeId] : data.document

    if (!targetNode) {
      return `import { Component } from '@angular/core';

@Component({
  selector: 'app-figma-component',
  template: \`
    <div class="figma-error" role="alert" aria-live="polite">
      <div class="error-content">
        <h2>Conversion Error</h2>
        <p>Error: Could not extract content from Figma file</p>
      </div>
    </div>
  \`,
  styleUrls: ['./figma-component.component.css']
})
export class FigmaComponentComponent {
  // Component logic here
}`
    }

    const angularContent = convertFigmaNodeToAngular(targetNode, responsive)

    return `import { Component } from '@angular/core';

@Component({
  selector: 'app-figma-component',
  template: \`
    <div class="figma-container" ${responsive ? 'style="max-width: 100%; overflow-x: auto;"' : ''}>
      ${angularContent}
    </div>
  \`,
  styleUrls: ['./figma-component.component.css']
})
export class FigmaComponentComponent {
  // Component logic here
}`
  } catch (error) {
    return `import { Component } from '@angular/core';

@Component({
  selector: 'app-figma-component',
  template: \`
    <div class="figma-error" role="alert" aria-live="polite">
      <div class="error-content">
        <h2>Generation Error</h2>
        <p>Error converting Figma design to Angular: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    </div>
  \`,
  styleUrls: ['./figma-component.component.css']
})
export class FigmaComponentComponent {
  // Component logic here
}`
  }
}

// Enhanced CSS fallback function
function generateCSS(data: any, nodeId?: string, responsive = true): string {
  try {
    const targetNode = nodeId ? data.nodes?.[nodeId] : data.document

    if (!targetNode) {
      return `.figma-error {
  color: #dc2626;
  padding: 1rem;
  border: 1px solid #dc2626;
  border-radius: 0.5rem;
  background-color: #fef2f2;
  margin: 1rem 0;
}`
    }

    const cssContent = convertFigmaNodeToCSS(targetNode, responsive)

    return `.figma-container {
  ${responsive ? 'max-width: 100%;\n  overflow-x: auto;' : ''}
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

${cssContent}`
  } catch (error) {
    return `.figma-error {
  color: #dc2626;
  padding: 1rem;
  border: 1px solid #dc2626;
  border-radius: 0.5rem;
  background-color: #fef2f2;
  margin: 1rem 0;
}`
  }
}

// Helper functions for React and Angular conversion
function convertFigmaNodeToReact(node: any, responsive = true): string {
  if (!node) return ''

  switch (node.type) {
    case 'DOCUMENT':
      return convertDocumentNodeToReact(node, responsive)
    case 'PAGE':
      return convertPageNodeToReact(node, responsive)
    case 'FRAME':
    case 'GROUP':
      return convertFrameNodeToReact(node, responsive)
    case 'RECTANGLE':
      return convertRectangleNodeToReact(node, responsive)
    case 'TEXT':
      return convertTextNodeToReact(node, responsive)
    case 'VECTOR':
      return convertVectorNodeToReact(node, responsive)
    case 'COMPONENT':
    case 'INSTANCE':
      return convertComponentNodeToReact(node, responsive)
    default:
      return convertGenericNodeToReact(node, responsive)
  }
}

function convertDocumentNodeToReact(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToReact(child, responsive)).join('\n') || ''
  return `<div className="figma-document" data-name="${node.name || 'Document'}">\n${children}\n</div>`
}

function convertPageNodeToReact(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToReact(child, responsive)).join('\n') || ''
  return `<div className="figma-page" data-name="${node.name || 'Page'}">\n${children}\n</div>`
}

function convertFrameNodeToReact(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToReact(child, responsive)).join('\n') || ''
  const bounds = node.absoluteBoundingBox
  const styles = bounds
    ? `style={{width: ${bounds.width}, height: ${bounds.height}, position: 'absolute', left: ${bounds.x}, top: ${bounds.y}}}`
    : ''
  return `<div className="figma-frame" data-name="${node.name || 'Frame'}" ${styles}>\n${children}\n</div>`
}

function convertRectangleNodeToReact(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  const fills = node.fills?.[0]
  const cornerRadius = node.cornerRadius || 0

  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}, height: ${bounds.height}, position: 'absolute', left: ${bounds.x}, top: ${bounds.y}`
  }
  if (cornerRadius) {
    styles += `, borderRadius: ${cornerRadius}`
  }
  if (fills?.color) {
    const color = fills.color
    styles += `, backgroundColor: \`rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1})\``
  }

  return `<div className="figma-rectangle" data-name="${node.name || 'Rectangle'}" style={{${styles}}}></div>`
}

function convertTextNodeToReact(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  const text = node.characters || ''
  const style = node.style || {}

  let styles = ''
  if (bounds) {
    styles += `position: 'absolute', left: ${bounds.x}, top: ${bounds.y}`
  }
  if (style.fontSize) {
    styles += `, fontSize: ${style.fontSize}`
  }
  if (style.fontFamily) {
    styles += `, fontFamily: "${style.fontFamily}"`
  }
  if (style.textAlignHorizontal) {
    styles += `, textAlign: '${style.textAlignHorizontal.toLowerCase()}'`
  }
  if (style.fills?.[0]?.color) {
    const color = style.fills[0].color
    styles += `, color: \`rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1})\``
  }

  return `<p className="figma-text" data-name="${node.name || 'Text'}" style={{${styles}}}>${text}</p>`
}

function convertVectorNodeToReact(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}, height: ${bounds.height}, position: 'absolute', left: ${bounds.x}, top: ${bounds.y}`
  }

  return `<div className="figma-vector" data-name="${node.name || 'Vector'}" style={{${styles}}}>
    <svg width={${bounds?.width || 0}} height={${bounds?.height || 0}} viewBox="0 0 ${bounds?.width || 0} ${bounds?.height || 0}">
      <rect width="100%" height="100%" fill="currentColor" opacity="0.1"/>
    </svg>
  </div>`
}

function convertComponentNodeToReact(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToReact(child, responsive)).join('\n') || ''
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}, height: ${bounds.height}, position: 'absolute', left: ${bounds.x}, top: ${bounds.y}`
  }

  return `<div className="figma-component" data-name="${node.name || 'Component'}" style={{${styles}}}>\n${children}\n</div>`
}

function convertGenericNodeToReact(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToReact(child, responsive)).join('\n') || ''
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}, height: ${bounds.height}, position: 'absolute', left: ${bounds.x}, top: ${bounds.y}`
  }

  return `<div className="figma-${node.type?.toLowerCase() || 'node'}" data-name="${node.name || 'Node'}" style={{${styles}}}>\n${children}\n</div>`
}

// Angular conversion functions
function convertFigmaNodeToAngular(node: any, responsive = true): string {
  if (!node) return ''

  switch (node.type) {
    case 'DOCUMENT':
      return convertDocumentNodeToAngular(node, responsive)
    case 'PAGE':
      return convertPageNodeToAngular(node, responsive)
    case 'FRAME':
    case 'GROUP':
      return convertFrameNodeToAngular(node, responsive)
    case 'RECTANGLE':
      return convertRectangleNodeToAngular(node, responsive)
    case 'TEXT':
      return convertTextNodeToAngular(node, responsive)
    case 'VECTOR':
      return convertVectorNodeToAngular(node, responsive)
    case 'COMPONENT':
    case 'INSTANCE':
      return convertComponentNodeToAngular(node, responsive)
    default:
      return convertGenericNodeToAngular(node, responsive)
  }
}

function convertDocumentNodeToAngular(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToAngular(child, responsive)).join('\n') ||
    ''
  return `<div class="figma-document" data-name="${node.name || 'Document'}">\n${children}\n</div>`
}

function convertPageNodeToAngular(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToAngular(child, responsive)).join('\n') ||
    ''
  return `<div class="figma-page" data-name="${node.name || 'Page'}">\n${children}\n</div>`
}

function convertFrameNodeToAngular(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToAngular(child, responsive)).join('\n') ||
    ''
  const bounds = node.absoluteBoundingBox
  const styles = bounds
    ? `style="width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;"`
    : ''
  return `<div class="figma-frame" data-name="${node.name || 'Frame'}" ${styles}>\n${children}\n</div>`
}

function convertRectangleNodeToAngular(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  const fills = node.fills?.[0]
  const cornerRadius = node.cornerRadius || 0

  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }
  if (cornerRadius) {
    styles += ` border-radius: ${cornerRadius}px;`
  }
  if (fills?.color) {
    const color = fills.color
    styles += ` background-color: rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1});`
  }

  return `<div class="figma-rectangle" data-name="${node.name || 'Rectangle'}" style="${styles}"></div>`
}

function convertTextNodeToAngular(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  const text = node.characters || ''
  const style = node.style || {}

  let styles = ''
  if (bounds) {
    styles += `position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }
  if (style.fontSize) {
    styles += ` font-size: ${style.fontSize}px;`
  }
  if (style.fontFamily) {
    styles += ` font-family: "${style.fontFamily}";`
  }
  if (style.textAlignHorizontal) {
    styles += ` text-align: ${style.textAlignHorizontal.toLowerCase()};`
  }
  if (style.fills?.[0]?.color) {
    const color = style.fills[0].color
    styles += ` color: rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1});`
  }

  return `<p class="figma-text" data-name="${node.name || 'Text'}" style="${styles}">${text}</p>`
}

function convertVectorNodeToAngular(node: any, responsive: boolean): string {
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }

  return `<div class="figma-vector" data-name="${node.name || 'Vector'}" style="${styles}">
    <svg width="${bounds?.width || 0}" height="${bounds?.height || 0}" viewBox="0 0 ${bounds?.width || 0} ${bounds?.height || 0}">
      <rect width="100%" height="100%" fill="currentColor" opacity="0.1"/>
    </svg>
  </div>`
}

function convertComponentNodeToAngular(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToAngular(child, responsive)).join('\n') ||
    ''
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }

  return `<div class="figma-component" data-name="${node.name || 'Component'}" style="${styles}">\n${children}\n</div>`
}

function convertGenericNodeToAngular(node: any, responsive: boolean): string {
  const children =
    node.children?.map((child: any) => convertFigmaNodeToAngular(child, responsive)).join('\n') ||
    ''
  const bounds = node.absoluteBoundingBox
  let styles = ''
  if (bounds) {
    styles += `width: ${bounds.width}px; height: ${bounds.height}px; position: absolute; left: ${bounds.x}px; top: ${bounds.y}px;`
  }

  return `<div class="figma-${node.type?.toLowerCase() || 'node'}" data-name="${node.name || 'Node'}" style="${styles}">\n${children}\n</div>`
}

// CSS conversion function
function convertFigmaNodeToCSS(node: any, responsive = true): string {
  if (!node) return ''

  let css = ''

  // Generate CSS for the current node
  css += generateNodeCSS(node, responsive)

  // Recursively generate CSS for children
  if (node.children) {
    node.children.forEach((child: any) => {
      css += convertFigmaNodeToCSS(child, responsive)
    })
  }

  return css
}

function generateNodeCSS(node: any, responsive: boolean): string {
  const nodeClass = `figma-${node.type?.toLowerCase() || 'node'}`
  const bounds = node.absoluteBoundingBox
  const fills = node.fills?.[0]
  const style = node.style || {}

  let css = `.${nodeClass} {\n`

  // Position and size
  if (bounds) {
    css += `  position: absolute;\n`
    css += `  left: ${bounds.x}px;\n`
    css += `  top: ${bounds.y}px;\n`
    css += `  width: ${bounds.width}px;\n`
    css += `  height: ${bounds.height}px;\n`
  }

  // Background color
  if (fills?.color) {
    const color = fills.color
    css += `  background-color: rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1});\n`
  }

  // Border radius
  if (node.cornerRadius) {
    css += `  border-radius: ${node.cornerRadius}px;\n`
  }

  // Text styles
  if (node.type === 'TEXT') {
    if (style.fontSize) {
      css += `  font-size: ${style.fontSize}px;\n`
    }
    if (style.fontFamily) {
      css += `  font-family: "${style.fontFamily}";\n`
    }
    if (style.textAlignHorizontal) {
      css += `  text-align: ${style.textAlignHorizontal.toLowerCase()};\n`
    }
    if (style.fills?.[0]?.color) {
      const color = style.fills[0].color
      css += `  color: rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1});\n`
    }
  }

  // Responsive styles
  if (responsive && node.type === 'FRAME') {
    css += `  max-width: 100%;\n  overflow-x: auto;\n`
  }

  css += `}\n\n`

  return css
}

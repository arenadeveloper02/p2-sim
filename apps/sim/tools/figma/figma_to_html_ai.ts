import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { buildToolLlmCostFields } from '@/lib/billing/core/tool-llm-cost'
import { getMaxOutputTokensForModel } from '@/providers/utils'
import type { ToolConfig, WorkflowToolExecutionContext } from '@/tools/types'

// Parameters for the tool
export interface FigmaToHTMLAIParams {
  fileKey: string
  nodeId?: string
  includeStyles?: boolean
  responsive?: boolean
  outputFormat?: 'html' | 'react' | 'vue'
  customPrompt?: string
  /** Injected at runtime by the tool executor for billing attribution. */
  _context?: WorkflowToolExecutionContext
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
      inputTokens: number
      outputTokens: number
      combinedHtml: string
    }
    /** Overall tool price (= LLM cost). */
    cost?: {
      input: number
      output: number
      total: number
    }
    model?: string
    tokens?: {
      input: number
      output: number
      total: number
    }
  }
  error?: string
}

/**
 * Converts Figma designs to HTML via the internal /api/tools/figma/to-html route.
 * All server-side work (Figma API access, asset rehosting to Sim file storage,
 * and the Anthropic call) happens in the route so this module stays client-safe.
 */
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
    url: '/api/tools/figma/to-html',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params) => ({
      fileKey: params.fileKey,
      nodeId: params.nodeId,
      includeStyles: params.includeStyles,
      responsive: params.responsive,
      outputFormat: params.outputFormat,
      customPrompt: params.customPrompt,
      workspaceId: params._context?.workspaceId,
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
      console.log('Figma data:', data)
      const figmaData = data

      // Generate AI prompt
      const prompt = generateAIPrompt(figmaData, params)

      // Call AI service
      const aiResult = await callAIService(prompt, params)

      const processingTime = Date.now() - startTime

      // Final cleanup of combined HTML
      let cleanedHtml = aiResult.combinedHtml
      cleanedHtml = cleanedHtml.replace(/```html\n?/g, '') // remove ```html
      cleanedHtml = cleanedHtml.replace(/```\n?/g, '')
      cleanedHtml = cleanedHtml.replace(/\r?\n|\r/g, '') // remove newlines first
      cleanedHtml = cleanedHtml.replace(/\\/g, '') // then remove backslashes
      cleanedHtml = cleanedHtml.replace(/\s\s+/g, ' ') // collapse extra spaces
      cleanedHtml = cleanedHtml.trim() // trim ends

      const billing = buildToolLlmCostFields(
        aiResult.model,
        aiResult.inputTokens,
        aiResult.outputTokens
      )

      return {
        success: true,
        output: {
          metadata: {
            fileKey: params.fileKey,
            nodeId: params.nodeId,
            processingTime,
            aiModel: aiResult.model,
            tokensUsed: aiResult.inputTokens + aiResult.outputTokens,
            inputTokens: aiResult.inputTokens,
            outputTokens: aiResult.outputTokens,
            combinedHtml: cleanedHtml,
          },
          ...(billing ?? {}),
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
      let cleanedHtml = generateFallbackCombinedHTML()
      cleanedHtml = cleanedHtml.replace(/```html\n?/g, '') // remove ```html
      cleanedHtml = cleanedHtml.replace(/```\n?/g, '')
      cleanedHtml = cleanedHtml.replace(/\r?\n|\r/g, '') // remove newlines first
      cleanedHtml = cleanedHtml.replace(/\\/g, '') // then remove backslashes
      cleanedHtml = cleanedHtml.replace(/\s\s+/g, ' ') // collapse extra spaces
      cleanedHtml = cleanedHtml.trim() // trim ends

      return {
        success: false,
        output: {
          metadata: {
            fileKey: params?.fileKey ?? '',
            nodeId: params?.nodeId,
            processingTime: 0,
            aiModel: 'fallback',
            tokensUsed: 0,
            inputTokens: 0,
            outputTokens: 0,
            combinedHtml: '',
          },
        },
        error: data.error || 'Figma to HTML conversion failed',
      }
    }

    return {
      success: true,
      output: {
        metadata: data.metadata,
      },
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
        combinedHtml: {
          type: 'string',
          description: 'Generated HTML document with embedded CSS styles',
        },
      },
    },
    cost: {
      type: 'object',
      description: 'LLM cost for the conversion (overall tool price)',
      optional: true,
    },
  },
}

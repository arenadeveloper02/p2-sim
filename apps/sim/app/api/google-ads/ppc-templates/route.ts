// PPC Templates API - Test endpoint for PPC template functionality

import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { PPC_TEMPLATES, getTemplate, getTemplateIds } from '../helpers/ppc-templates'
import { detectPPCTemplate, extractPPCParameters } from '../helpers/ppc-detection'
import { PPCTemplateProcessor } from '../helpers/template-processor'

const logger = createLogger('PPCTemplatesAPI')

/**
 * GET /api/google-ads/ppc-templates
 * Returns list of available PPC templates
 */
export async function GET(request: NextRequest) {
  try {
    logger.info('Fetching PPC templates list')

    const templates = Object.values(PPC_TEMPLATES).map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      requiredParams: template.requiredParams,
      outputFormat: template.outputFormat,
      parameters: template.parameters
    }))

    return NextResponse.json({
      success: true,
      templates,
      count: templates.length
    })

  } catch (error) {
    logger.error('Failed to fetch PPC templates', { 
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch PPC templates',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/google-ads/ppc-templates
 * Test PPC template processing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, templateId, params } = body

    logger.info('Processing PPC template request', { query, templateId, params })

    // If query is provided, detect template and extract parameters
    if (query && !templateId) {
      const detectedTemplateId = detectPPCTemplate(query)
      if (!detectedTemplateId) {
        return NextResponse.json(
          { 
            success: false,
            error: 'No PPC template detected in query',
            query
          },
          { status: 400 }
        )
      }

      const extractedParams = extractPPCParameters(query, detectedTemplateId)
      
      return NextResponse.json({
        success: true,
        detectedTemplate: detectedTemplateId,
        extractedParams,
        template: getTemplate(detectedTemplateId)
      })
    }

    // If templateId is provided, process the template
    if (templateId) {
      const template = getTemplate(templateId)
      if (!template) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Template not found',
            templateId
          },
          { status: 404 }
        )
      }

      // Use provided params or extract from query
      const processParams = params || (query ? extractPPCParameters(query, templateId) : {})
      
      // Set default accounts if not provided
      if (!processParams.accounts) {
        processParams.accounts = 'service_air_eastern_shore' // Default for testing
      }

      // Set default date range if not provided
      if (!processParams.startDate) {
        processParams.startDate = '2025-05-01'
      }
      if (!processParams.endDate) {
        processParams.endDate = '2025-07-31'
      }

      logger.info('Processing template with params', { templateId, processParams })

      const result = await PPCTemplateProcessor.processTemplate(templateId, processParams)

      return NextResponse.json({
        success: true,
        result
      })
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Either query or templateId must be provided'
      },
      { status: 400 }
    )

  } catch (error) {
    logger.error('PPC template processing failed', { 
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      { 
        success: false,
        error: 'PPC template processing failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/google-ads/ppc-templates
 * Test template detection
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { query } = body

    if (!query) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Query is required'
        },
        { status: 400 }
      )
    }

    logger.info('Testing template detection', { query })

    const detectedTemplateId = detectPPCTemplate(query)
    
    if (detectedTemplateId) {
      const template = getTemplate(detectedTemplateId)
      const extractedParams = extractPPCParameters(query, detectedTemplateId)

      return NextResponse.json({
        success: true,
        detected: true,
        templateId: detectedTemplateId,
        template,
        extractedParams,
        query
      })
    } else {
      return NextResponse.json({
        success: true,
        detected: false,
        templateId: null,
        query,
        availableTemplates: getTemplateIds()
      })
    }

  } catch (error) {
    logger.error('Template detection failed', { 
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      { 
        success: false,
        error: 'Template detection failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

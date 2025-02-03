import { NextResponse } from 'next/server'
import { getTool } from '@/tools'

export async function POST(request: Request) {
  try {
    // Expecting a tool identifier and the validated parameters
    const { toolId, params } = await request.json()

    // Look up the tool config from the registry
    const tool = getTool(toolId)
    if (!tool) {
      return NextResponse.json(
        {
          success: false,
          error: `Tool not found: ${toolId}`,
          details: { toolId }
        }, 
        { status: 400 }
      )
    }

    // Destructure the request configuration from the tool
    const { url: urlOrFn, method: defaultMethod, headers: headersFn, body: bodyFn } = tool.request

    // Compute the external URL
    const url = typeof urlOrFn === 'function' ? urlOrFn(params) : urlOrFn

    // If the params override the method, allow it (or use the default)
    const method = params.method || defaultMethod || 'GET'

    // Compute headers using the tool's function
    const headers = headersFn ? headersFn(params) : {}

    // Build request body if needed
    const hasBody = method !== 'GET' && method !== 'HEAD' && !!bodyFn
    const body = hasBody ? JSON.stringify(bodyFn!(params)) : undefined

    // Execute external fetch from the server side
    const externalResponse = await fetch(url, { method, headers, body })

    // If the response is not OK, transform the error
    if (!externalResponse.ok) {
      const errorContent = await externalResponse.json().catch(() => ({ 
        message: externalResponse.statusText 
      }))
      
      // Pass the complete error response to transformError
      const error = tool.transformError
        ? tool.transformError({
            ...errorContent,
            status: externalResponse.status,
            statusText: externalResponse.statusText,
            // Include raw headers as they were sent
            headers: {
              authorization: externalResponse.headers.get('authorization'),
              'content-type': externalResponse.headers.get('content-type')
            }
          })
        : errorContent.message || 'External API error'

      // Return error in a format that matches the ToolResponse type
      return NextResponse.json({
        success: false,
        output: {},
        error: error
      }, { 
        status: externalResponse.status 
      })
    }

    // Transform the response if needed
    const transformResponse =
      tool.transformResponse ||
      (async (resp: Response) => ({
        success: true,
        output: await resp.json(),
      }))
    const result = await transformResponse(externalResponse)

    if (!result.success) {
      const error = tool.transformError
        ? tool.transformError(result)
        : 'Tool returned an error'
      
      return NextResponse.json({
        success: false,
        output: {},
        error: error
      }, { 
        status: 400 
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Proxy route error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        details: {
          name: error.name,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      },
      { status: 500 }
    )
  }
} 
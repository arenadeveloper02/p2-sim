import { NextResponse } from 'next/server'
import { getTool } from '@/tools'
import { anthropicProvider } from '@/providers/anthropic'
import { openaiProvider } from '@/providers/openai'
import { ProviderConfig } from '@/providers/types'
import { googleProvider } from '@/providers/google'

const providers: Record<string, ProviderConfig> = {
  'anthropic/chat': anthropicProvider,
  'openai/chat': openaiProvider,
  'google/chat': googleProvider
}

export async function POST(request: Request) {
  try {
    const { toolId, params } = await request.json()

    // Check if this is a provider chat request
    const provider = providers[toolId]
    if (provider) {
      const { apiKey, ...restParams } = params
      if (!apiKey) {
        throw new Error('API key is required')
      }

      const response = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: provider.headers(apiKey),
        body: JSON.stringify(restParams)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || `${toolId} API error`)
      }

      return NextResponse.json({
        success: true,
        output: await response.json()
      })
    }

    // Handle regular tool requests
    const tool = getTool(toolId)
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    if (tool.params?.apiKey?.required && !params.apiKey) {
      throw new Error(`API key is required for ${toolId}`)
    }

    const { url: urlOrFn, method: defaultMethod, headers: headersFn, body: bodyFn } = tool.request

    try {
      const url = typeof urlOrFn === 'function' ? urlOrFn(params) : urlOrFn
      const method = params.method || defaultMethod || 'GET'
      const headers = headersFn ? headersFn(params) : {}
      const hasBody = method !== 'GET' && method !== 'HEAD' && !!bodyFn
      const body = hasBody ? JSON.stringify(bodyFn!(params)) : undefined

      const externalResponse = await fetch(url, { method, headers, body })

      if (!externalResponse.ok) {
        const errorContent = await externalResponse.json().catch(() => ({ 
          message: externalResponse.statusText 
        }))
        
        // Use the tool's error transformer or a default message
        const error = tool.transformError
          ? tool.transformError(errorContent)
          : errorContent.message || `${toolId} API error: ${externalResponse.statusText}`

        throw new Error(error)
      }

      const transformResponse =
        tool.transformResponse ||
        (async (resp: Response) => ({
          success: true,
          output: await resp.json(),
        }))
      const result = await transformResponse(externalResponse)

      if (!result.success) {
        throw new Error(
          tool.transformError
            ? tool.transformError(result)
            : 'Tool returned an error'
        )
      }

      return NextResponse.json(result)
    } catch (error: any) {
      throw error
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    })
  }
} 
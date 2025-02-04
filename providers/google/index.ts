import { ProviderConfig, FunctionCallResponse, ProviderToolConfig, ProviderRequest } from '../types'
import { ToolConfig } from '@/tools/types'

export const googleProvider: ProviderConfig = {
  id: 'google',
  name: 'Google',
  description: 'Google\'s Gemini models',
  version: '1.0.0',
  models: ['gemini-pro'],
  defaultModel: 'gemini-pro',
  
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
  headers: (apiKey: string) => ({
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  }),

  transformToolsToFunctions: (tools: ProviderToolConfig[]) => {
    if (!tools || tools.length === 0) {
      return undefined
    }

    const transformProperties = (properties: Record<string, any>): Record<string, any> => {
      return Object.entries(properties).reduce((acc, [key, value]) => {
        // Skip complex JSON/object parameters for Gemini
        if (value.type === 'json' || (value.type === 'object' && !value.properties)) {
          return acc
        }

        // For object types with defined properties
        if (value.type === 'object' && value.properties) {
          return {
            ...acc,
            [key]: {
              type: 'OBJECT',
              description: value.description || '',
              properties: transformProperties(value.properties)
            }
          }
        }

        // For simple types
        return {
          ...acc,
          [key]: {
            type: (value.type || 'string').toUpperCase(),
            description: value.description || ''
          }
        }
      }, {})
    }

    return {
      functionDeclarations: tools.map(tool => {
        // Get properties excluding complex types
        const properties = transformProperties(tool.parameters.properties)
        
        // Filter required fields to only include ones that exist in properties
        const required = (tool.parameters.required || [])
          .filter(field => field in properties)

        return {
          name: tool.id,
          description: tool.description || '',
          parameters: {
            type: 'OBJECT',
            properties,
            required
          }
        }
      })
    }
  },

  transformFunctionCallResponse: (response: any, tools?: ProviderToolConfig[]): FunctionCallResponse => {
    // Extract function call from Gemini response
    const functionCall = response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    if (!functionCall) {
      throw new Error('No function call found in response')
    }

    // Log the function call for debugging
    console.log('Raw function call from Gemini:', JSON.stringify(functionCall, null, 2))

    const tool = tools?.find(t => t.id === functionCall.name)
    if (!tool) {
      throw new Error(`Tool not found: ${functionCall.name}`)
    }

    // Ensure args is an object
    let args = functionCall.args
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args)
      } catch (e) {
        console.error('Failed to parse function call args:', e)
        args = {}
      }
    }

    // Get arguments from function call, but NEVER override apiKey
    const { apiKey: _, ...functionArgs } = args

    return {
      name: functionCall.name,
      arguments: {
        ...functionArgs,
        apiKey: tool.params.apiKey // Always use the apiKey from tool params
      }
    }
  },

  transformRequest: (request: ProviderRequest, functions?: any) => {
    // Combine system prompt and context into a single message if both exist
    const initialMessage = request.systemPrompt + (request.context ? `\n\n${request.context}` : '')
    
    const messages = [
      { role: 'user', parts: [{ text: initialMessage }] },
      ...(request.messages || []).map(msg => {
        if (msg.role === 'function') {
          return {
            role: 'user',
            parts: [{
              functionResponse: {
                name: msg.name,
                response: {
                  name: msg.name,
                  content: JSON.parse(msg.content || '{}')
                }
              }
            }]
          }
        }
        
        if (msg.function_call) {
          return {
            role: 'model',
            parts: [{
              functionCall: {
                name: msg.function_call.name,
                args: JSON.parse(msg.function_call.arguments)
              }
            }]
          }
        }

        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content || '' }]
        }
      })
    ]

    // Log the request for debugging
    console.log('Gemini request:', JSON.stringify({
      messages,
      tools: functions ? [{ functionDeclarations: functions.functionDeclarations }] : undefined
    }, null, 2))

    return {
      contents: messages,
      tools: functions ? [{ functionDeclarations: functions.functionDeclarations }] : undefined,
      generationConfig: {
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.maxTokens || 1024,
      }
    }
  },

  transformResponse: (response: any) => {
    return {
      content: response.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokens: response.usageMetadata && {
        prompt: response.usageMetadata.promptTokenCount,
        completion: response.usageMetadata.candidatesTokenCount,
        total: response.usageMetadata.totalTokenCount
      }
    }
  },

  hasFunctionCall: (response: any) => {
    return !!response.candidates?.[0]?.content?.parts?.[0]?.functionCall
  }
} 
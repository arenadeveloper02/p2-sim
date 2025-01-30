import { ToolConfig, ToolResponse } from './types'
import { chatTool as openAIChat } from './openai/chat' 
import { chatTool as anthropicChat } from './anthropic/chat' 
import { chatTool as googleChat } from './google/chat' 
import { chatTool as xaiChat } from './xai/chat' 
import { chatTool as deepseekChat } from './deepseek/chat' 
import { reasonerTool as deepseekReasoner } from './deepseek/reasoner' 
import { requestTool as httpRequest } from './http/request' 
import { contactsTool as hubspotContacts } from './hubspot/contacts' 
import { opportunitiesTool as salesforceOpportunities } from './salesforce/opportunities' 
import { functionExecuteTool as functionExecute } from './function/execute'
import { visionTool as crewAIVision } from './crewai/vision'
import { scrapeTool } from './firecrawl/scrape'
// Registry of all available tools
export const tools: Record<string, ToolConfig> = {
  // AI Models
  'openai.chat': openAIChat,
  'anthropic.chat': anthropicChat,
  'google.chat': googleChat,
  'xai.chat': xaiChat,
  'deepseek.chat': deepseekChat,
  'deepseek.reasoner': deepseekReasoner,
  // HTTP
  'http.request': httpRequest,
  // CRM Tools
  'hubspot.contacts': hubspotContacts,
  'salesforce.opportunities': salesforceOpportunities,
  // Function Tools
  'function.execute': functionExecute,
  // CrewAI Tools
  'crewai.vision': crewAIVision,
  // Firecrawl Tools
  'firecrawl.scrape': scrapeTool
} 

// Get a tool by its ID
export function getTool(toolId: string): ToolConfig | undefined {
  return tools[toolId] 
}

// Execute a tool with parameters
export async function executeTool(
  toolId: string,
  params: Record<string, any>
): Promise<ToolResponse> {
  const tool = getTool(toolId) 

  if (!tool) {
    return {
      success: false,
      output: {},
      error: `Tool not found: ${toolId}`
    }
  }

  try {
    // Get the URL (which might be a function or string)
    const url = typeof tool.request.url === 'function' 
      ? tool.request.url(params) 
      : tool.request.url 

    // Make the HTTP request
    const response = await fetch(url, {
      method: tool.request.method,
      headers: tool.request.headers(params),
      body: tool.request.body ? JSON.stringify(tool.request.body(params)) : undefined
    }) 

    // Transform the response
    const result = await tool.transformResponse(response)
    return result

  } catch (error) {
    return {
      success: false,
      output: {},
      error: tool.transformError(error)
    }
  }
} 
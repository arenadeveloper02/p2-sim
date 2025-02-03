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
import { readUrlTool } from './jina/reader'
import { slackMessageTool } from './slack/message'
import { repoInfoTool } from './github/repo'

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
  'firecrawl.scrape': scrapeTool,
  // Jina Tools
  'jina.readurl': readUrlTool,
  // Slack Tools
  'slack.message': slackMessageTool,
  // GitHub Tools
  'github.repoinfo': repoInfoTool
} 

// Get a tool by its ID
export function getTool(toolId: string): ToolConfig | undefined {
  return tools[toolId] 
}

// Execute a tool by calling the reverse proxy endpoint.
export async function executeTool(
  toolId: string,
  params: Record<string, any>
): Promise<ToolResponse> {
  try {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId, params }),
    })
    
    const result = await response.json()
    
    if (!result.success) {
      return {
        success: false,
        output: {},
        error: result.error
      }
    }
    
    return result
  } catch (error: any) {
    return {
      success: false,
      output: {},
      error: error.message || 'Unknown error'
    }
  }
} 
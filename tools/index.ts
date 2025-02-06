import { chatTool as anthropicChat } from './anthropic/chat'
import { visionTool as crewAIVision } from './crewai/vision'
import { chatTool as deepseekChat } from './deepseek/chat'
import { reasonerTool as deepseekReasoner } from './deepseek/reasoner'
import { scrapeTool } from './firecrawl/scrape'
import { functionExecuteTool as functionExecute } from './function/execute'
import { repoInfoTool } from './github/repo'
import { chatTool as googleChat } from './google/chat'
import { requestTool as httpRequest } from './http/request'
import { contactsTool as hubspotContacts } from './hubspot/contacts'
import { readUrlTool } from './jina/reader'
import { chatTool as openAIChat } from './openai/chat'
import { opportunitiesTool as salesforceOpportunities } from './salesforce/opportunities'
import { searchTool as serperSearch } from './serper/search'
import { slackMessageTool } from './slack/message'
import { extractTool as tavilyExtract } from './tavily/extract'
import { searchTool as tavilySearch } from './tavily/search'
import { ToolConfig, ToolResponse } from './types'
import { chatTool as xaiChat } from './xai/chat'

/**
 * Registry of all available tools. Each tool is designed for specific use cases:
 *
 * AI Model Tools:
 * - openai_chat: Advanced language model for general conversation, reasoning, and task completion
 * - anthropic_chat: Claude model specialized in detailed analysis and complex reasoning
 * - google_chat: PaLM model for general conversation and task assistance
 * - xai_chat: Specialized AI model for explainable AI interactions
 * - deepseek_chat: Code-specialized language model for programming tasks
 * - deepseek_reasoner: Advanced reasoning model for complex problem-solving
 *
 * Web & Data Tools:
 * - http_request: Make HTTP requests to any API endpoint with custom headers and body
 * - firecrawl_scrape: Extract structured data from web pages with advanced scraping
 * - jina_readurl: Efficiently read and parse content from web URLs
 * - serper_search: Perform web searches with high-quality, structured results
 * - tavily_search: AI-powered web search with comprehensive results
 * - tavily_extract: Extract specific information from web content
 *
 * Business Integration Tools:
 * - hubspot_contacts: Manage and query HubSpot CRM contacts
 * - salesforce_opportunities: Handle Salesforce sales opportunities
 * - slack_message: Send messages to Slack channels or users
 * - github_repoinfo: Fetch detailed information about GitHub repositories
 *
 * Utility Tools:
 * - function_execute: Execute custom JavaScript functions with provided parameters
 * - crewai_vision: Process and analyze images with AI capabilities
 */
export const tools: Record<string, ToolConfig> = {
  // AI Models
  openai_chat: openAIChat,
  anthropic_chat: anthropicChat,
  google_chat: googleChat,
  xai_chat: xaiChat,
  deepseek_chat: deepseekChat,
  deepseek_reasoner: deepseekReasoner,
  // HTTP
  http_request: httpRequest,
  // CRM Tools
  hubspot_contacts: hubspotContacts,
  salesforce_opportunities: salesforceOpportunities,
  // Function Tools
  function_execute: functionExecute,
  // CrewAI Tools
  crewai_vision: crewAIVision,
  // Firecrawl Tools
  firecrawl_scrape: scrapeTool,
  // Jina Tools
  jina_readurl: readUrlTool,
  // Slack Tools
  slack_message: slackMessageTool,
  // GitHub Tools
  github_repoinfo: repoInfoTool,
  // Search Tools
  serper_search: serperSearch,
  tavily_search: tavilySearch,
  tavily_extract: tavilyExtract,
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
        error: result.error,
      }
    }

    return result
  } catch (error: any) {
    return {
      success: false,
      output: {},
      error: error.message || 'Unknown error',
    }
  }
}

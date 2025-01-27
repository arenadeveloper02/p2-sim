import { ToolConfig } from './types';
import { chatTool as openaiChat } from './openai/chat';
import { chatTool as anthropicChat } from './anthropic/chat';
import { chatTool as googleChat } from './google/chat';
import { chatTool as xaiChat } from './xai/chat';
import { chatTool as deepseekChat } from './deepseek/chat';
import { reasonerTool as deepseekReasoner } from './deepseek/reasoner';
import { requestTool as httpRequest } from './http/request';
import { contactsTool as hubspotContacts } from './hubspot/contacts';
import { opportunitiesTool as salesforceOpportunities } from './salesforce/opportunities';
import { functionExecuteTool as functionExecute } from './function/execute';

// Registry of all available tools
export const tools: Record<string, ToolConfig> = {
  // AI Models
  'openai.chat': openaiChat,
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
  'function.execute': functionExecute
};

// Get a tool by its ID
export function getTool(toolId: string): ToolConfig | undefined {
  return tools[toolId];
}

// Execute a tool with parameters
export async function executeTool(
  toolId: string,
  params: Record<string, any>
): Promise<any> {
  const tool = getTool(toolId);

  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`);
  }

  try {
    // Get the URL (which might be a function or string)
    const url = typeof tool.request.url === 'function' 
      ? tool.request.url(params) 
      : tool.request.url;

    // Make the HTTP request
    const response = await fetch(url, {
      method: tool.request.method,
      headers: tool.request.headers(params),
      body: tool.request.body ? JSON.stringify(tool.request.body(params)) : undefined
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(tool.transformError(error));
    }

    const data = await response.json();
    return tool.transformResponse(data);
  } catch (error) {
    throw new Error(tool.transformError(error));
  }
} 
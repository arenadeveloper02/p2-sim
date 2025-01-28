export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' 

export interface ToolResponse {
  output: any   // All tools must provide an output field
  [key: string]: any   // Tools can include additional metadata
}

export interface ToolConfig<P = any, R extends ToolResponse = ToolResponse> {
  // Basic tool identification
  id: string 
  name: string 
  description: string 
  version: string 

  // Parameter schema - what this tool accepts
  params: Record<string, {
    type: string 
    required?: boolean 
    default?: any 
    description?: string 
  }> 

  // Request configuration
  request: {
    url: string | ((params: P) => string) 
    method: string 
    headers: (params: P) => Record<string, string> 
    body?: (params: P) => Record<string, any> 
  } 

  // Response handling
  transformResponse: (response: Response) => Promise<R> 
  transformError: (error: any) => string 
} 
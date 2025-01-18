export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ToolConfig<P = any, R = any> {
  // Basic tool identification
  id: string;
  name: string;
  description: string;
  version: string;

  // Parameter schema - what this tool accepts
  params: Record<string, {
    type: string;
    required?: boolean;
    default?: any;
    description?: string;
  }>;

  // Request configuration
  request: {
    url: string | ((params: P) => string);
    method: string;
    headers: (params: P) => Record<string, string>;
    body?: (params: P) => Record<string, any>;
  };

  // Response handling
  transformResponse: (data: any) => R;
  transformError: (error: any) => string;
} 
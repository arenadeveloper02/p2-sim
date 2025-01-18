export interface Tool<P = any, R = any> {
  id: string;
  name: string;
  description: string;
  version: string;
  params: {
    [key: string]: {
      type: string;
      required?: boolean;
      description?: string;
      default?: any;
    };
  };
  request: {
    url: string | ((params: P) => string);
    method: string;
    headers: (params: P) => Record<string, string>;
    body?: (params: P) => Record<string, any>;
  };
  transformResponse: (response: any) => R;
  transformError: (error: any) => string;
}

export interface ToolRegistry {
  [key: string]: Tool;
}

export interface ExecutionContext {
  workflowId: string;
  blockStates: Map<string, any>;
  input: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  data: Record<string, any>;
  error?: string;
  metadata?: {
    duration: number;
    startTime: string;
    endTime: string;
  };
} 
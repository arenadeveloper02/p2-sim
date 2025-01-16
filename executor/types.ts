export interface Tool {
  name: string;
  execute(params: Record<string, any>): Promise<Record<string, any>>;
  validateParams(params: Record<string, any>): boolean | string;
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
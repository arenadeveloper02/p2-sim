export interface AgentConfig {
    model: string;
    systemPrompt: string;
    prompt?: string;
    temperature: number;
    apiKey: string;
  } 

export interface AgentResult {
  success: boolean;
  data?: {
    response: string;
    tokens: number;
    model: string;
  };
  error?: string;
} 
import { Tool, ToolRegistry } from '@/executor/types';
import { ModelService } from './model-service';
import { HttpService } from './http-service';
import { AgentConfig } from './model-service/types/agent';

class ModelTool implements Tool {
  name = 'model';
  private service: ModelService;

  constructor() {
    this.service = ModelService.getInstance();
  }

  validateParams(params: Record<string, any>): boolean | string {
    const required = ['model', 'prompt'];
    const missing = required.filter(param => !params[param]);
    if (missing.length > 0) {
      return `Missing required parameters: ${missing.join(', ')}`;
    }
    return true;
  }

  async execute(params: Record<string, any>): Promise<Record<string, any>> {
    const config: AgentConfig = {
      model: params.model,
      systemPrompt: params.systemPrompt || 'You are a helpful assistant.',
      prompt: params.prompt,
      temperature: params.temperature || 0.7,
      apiKey: params.apiKey || process.env.OPENAI_API_KEY || ''
    };

    const response = await this.service.callModel(config);
    return {
      response: response.response,
      tokens: response.tokens,
      model: response.model
    };
  }
}

class HttpTool implements Tool {
  name = 'http';
  private service: HttpService;

  constructor() {
    this.service = HttpService.getInstance();
  }

  validateParams(params: Record<string, any>): boolean | string {
    if (!params.url) {
      return 'Missing required parameter: url';
    }
    return true;
  }

  async execute(params: Record<string, any>): Promise<Record<string, any>> {
    const response = await this.service.request({
      url: params.url,
      method: params.method || 'GET',
      headers: params.headers || {},
      body: params.body,
      timeout: params.timeout
    });

    return {
      data: response.data,
      status: response.status,
      headers: response.headers
    };
  }
}

export const toolRegistry: ToolRegistry = {
  model: new ModelTool(),
  http: new HttpTool()
}; 
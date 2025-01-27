import { AgentIcon } from '@/components/icons'
import { BlockConfig } from '../types'

// Map of models to their tools
const MODEL_TOOLS = {
  'gpt-4o': 'openai.chat',
  'claude-3-5-sonnet-20241022': 'anthropic.chat',
  'gemini-pro': 'google.chat',
  'grok-2-latest': 'xai.chat',
  'deepseek-v3': 'deepseek.chat',
  'deepseek-r1': 'deepseek.reasoner'
} as const;

export const AgentBlock: BlockConfig = {
  type: 'agent',
  toolbar: {
    title: 'Agent',
    description: 'Use any LLM',
    bgColor: '#7F2FFF',
    icon: AgentIcon,
    category: 'basic',
  },
  tools: {
    access: ['openai.chat', 'anthropic.chat', 'google.chat', 'xai.chat', 'deepseek.chat', 'deepseek.reasoner'],
    config: {
      tool: (params: Record<string, any>) => {
        const model = params.model || 'gpt-4o';

        if (!model) {
          throw new Error('No model selected');
        }

        const tool = MODEL_TOOLS[model as keyof typeof MODEL_TOOLS];

        if (!tool) {
          throw new Error(`Invalid model selected: ${model}`);
        }
        
        return tool;
      }
    }
  },
  workflow: {
    outputType: {
      default: 'string',
      dependsOn: {
        subBlockId: 'responseFormat',
        condition: {
          whenEmpty: 'string',
          whenFilled: 'json'
        }
      }
    },
    inputs: {
      systemPrompt: 'string'
    },
    subBlocks: [
      {
        id: 'systemPrompt',
        title: 'System Prompt',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Enter prompt'
      },
      {
        id: 'context',
        title: 'Context',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter text'
      },
      {
        id: 'model',
        title: 'Model',
        type: 'dropdown',
        layout: 'half',
        options: Object.keys(MODEL_TOOLS)
      },
      {
        id: 'temperature',
        title: 'Temperature',
        type: 'slider',
        layout: 'half',
        min: 0,
        max: 2,
      },
      {
        id: 'apiKey',
        title: "API Key",
        type: "short-input",
        layout: "full",
        placeholder: "Enter your API key",
        password: true
      },
      {
        id: 'responseFormat',
        title: 'Response Format',
        type: 'code',
        layout: 'full'
      }
    ]
  }
}